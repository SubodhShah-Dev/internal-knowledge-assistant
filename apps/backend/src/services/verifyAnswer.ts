import { chat, llmModel, LlmUnavailableError, type ChatMessage } from './llm';
import type { Source } from '../routes/questions.types';

export type ClaimStatus = 'supported' | 'partial' | 'unsupported' | 'uncited' | 'unverified';

export type VerifiedClaim = {
  text: string;
  sourceLabels: string[];
  status: ClaimStatus;
};

export type OverallStatus = 'verified' | 'partial' | 'unsupported' | 'unverified';

export type Verification = {
  status: OverallStatus;
  score: number; // 0-100
  claims: VerifiedClaim[];
};

const LABEL_PATTERN = /\[\s*(S\d+)\s*\]/g;
const INVISIBLE_CHARS = /[\u200B\u200C\u200D\u2060\uFEFF]/g;
const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/;

/** Strip invisible Unicode (zero-width spaces etc.) that models sprinkle into answers. */
export function normalizeAnswerText(answer: string): string {
  return answer.replace(INVISIBLE_CHARS, '');
}

/**
 * Split an answer into claim candidates and collect the [S#] labels each
 * claims to cite. Short fragments (fewer than ~5 words) are folded into the
 * previous claim so "leftover" punctuation pieces do not become claims.
 */
export function parseClaims(answer: string): Array<{ text: string; sourceLabels: string[] }> {
  const pieces = normalizeAnswerText(answer)
    .split(SENTENCE_SPLIT)
    .map(piece => piece.trim())
    .filter(piece => piece.length > 0);

  const claims: Array<{ text: string; sourceLabels: string[] }> = [];
  for (const piece of pieces) {
    const sourceLabels = [...new Set([...piece.matchAll(LABEL_PATTERN)].map(match => match[1]))];
    const words = piece.replace(LABEL_PATTERN, '').trim().split(/\s+/).filter(Boolean);
    const isFragment = words.length < 3 && claims.length > 0;

    if (isFragment) {
      const previous = claims[claims.length - 1];
      previous.text = `${previous.text} ${piece}`;
      previous.sourceLabels = [...new Set([...previous.sourceLabels, ...sourceLabels])];
      continue;
    }
    claims.push({ text: piece, sourceLabels });
  }
  return claims;
}

function scoreClaims(claims: VerifiedClaim[]): { score: number; status: OverallStatus } {
  if (claims.length === 0) return { score: 0, status: 'unsupported' };
  const points = claims.reduce((sum, claim) => {
    if (claim.status === 'supported') return sum + 1;
    if (claim.status === 'partial') return sum + 0.5;
    return sum;
  }, 0);
  const score = Math.round((points / claims.length) * 100);
  const anySupport = claims.some(c => c.status === 'supported' || c.status === 'partial');
  const allSupported = claims.every(c => c.status === 'supported');
  const status: OverallStatus = allSupported ? 'verified' : anySupport ? 'partial' : 'unsupported';
  return { score, status };
}

function unverifiedResult(claims: Array<{ text: string; sourceLabels: string[] }>): Verification {
  return {
    status: 'unverified',
    score: 0,
    claims: claims.map(claim => ({ ...claim, status: 'unverified' as const }))
  };
}

function buildVerifierPrompt(answer: string, sources: Source[], claims: Array<{ text: string; sourceLabels: string[] }>): ChatMessage[] {
  const excerptBlock = sources
    .map(source => `[${source.label}] ${source.title} (chunk ${source.chunkIndex})\n${source.excerpt}`)
    .join('\n\n');

  const claimBlock = claims
    .map((claim, index) => `${index}. ${claim.text} (cited: ${claim.sourceLabels.join(', ') || 'none'})`)
    .join('\n');

  return [
    {
      role: 'system',
      content:
        'You are a strict verification auditor for a document Q&A system. ' +
        'For each numbered claim, decide whether the CITED excerpts entail it. ' +
        'Use only the cited excerpts; ignore whatever the claim itself asserts. ' +
        'status must be "supported" (excerpt fully entails the claim), "partial" (some support but overstated or incomplete), or "unsupported" (not entailed by the cited excerpts). ' +
        'A claim citing no sources is "unsupported". ' +
        'Respond with ONLY a JSON array, no prose, exactly one object per claim: ' +
        '[{"id": 0, "status": "supported"|"partial"|"unsupported"}].'
    },
    {
      role: 'user',
      content: `DOCUMENT EXCERPTS:\n${excerptBlock}\n\nCLAIMS:\n${claimBlock}\n\nReturn the JSON array now.`
    }
  ];
}

function parseVerifierJson(raw: string, claimCount: number): ClaimStatus[] | null {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  const bracket = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (bracket === -1 || end === -1 || end <= bracket) return null;

  let parsed: any;
  try {
    parsed = JSON.parse(text.slice(bracket, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== claimCount) return null;

  const allowed = new Set(['supported', 'partial', 'unsupported']);
  const statuses: ClaimStatus[] = [];
  for (let id = 0; id < claimCount; id += 1) {
    const entry = parsed.find((item: any) => Number(item?.id) === id) ?? parsed[id];
    const status = String(entry?.status ?? '').toLowerCase();
    statuses.push(allowed.has(status) ? (status as ClaimStatus) : 'unsupported');
  }
  return statuses;
}

/**
 * Groundedness Audit: decompose the answer into claims, structurally check
 * citations (uncited and unknown-label claims are settled without an LLM
 * call), then verify the remaining claims against their cited excerpts.
 * Never throws; degrades to an "unverified" result so the answer is always
 * delivered.
 */
export async function verifyAnswer(answer: string, sources: Source[]): Promise<Verification> {
  const parsed = parseClaims(answer);
  if (parsed.length === 0 || sources.length === 0) {
    return unverifiedResult(parsed);
  }

  const validLabels = new Set(sources.map(source => source.label));
  const claims: VerifiedClaim[] = parsed.map(claim => {
    if (claim.sourceLabels.length === 0) return { ...claim, status: 'uncited' };
    const citesKnown = claim.sourceLabels.every(label => validLabels.has(label));
    return { ...claim, status: citesKnown ? 'unverified' : 'unsupported' };
  });

  // Only structurally sound claims go to the verifier LLM.
  const pendingIndexes = claims
    .map((claim, index) => ({ claim, index }))
    .filter(({ claim }) => claim.status === 'unverified')
    .map(({ index }) => index);

  if (pendingIndexes.length > 0) {
    try {
      const pendingClaims = pendingIndexes.map(index => parsed[index]);
      const raw = await chat(buildVerifierPrompt(answer, sources, pendingClaims), { temperature: 0 });
      const statuses = parseVerifierJson(raw, pendingClaims.length);
      if (statuses) {
        pendingIndexes.forEach((claimIndex, i) => {
          claims[claimIndex].status = statuses[i];
        });
      } else {
        pendingIndexes.forEach(claimIndex => {
          claims[claimIndex].status = 'unverified';
        });
      }
    } catch (error) {
      if (!(error instanceof LlmUnavailableError)) throw error;
      pendingIndexes.forEach(claimIndex => {
        claims[claimIndex].status = 'unverified';
      });
    }
  }

  const auditable = claims.filter(claim => claim.status !== 'unverified');
  const { score: auditedScore, status: auditedStatus } = scoreClaims(auditable);
  const hasUnverified = claims.some(claim => claim.status === 'unverified');

  if (!hasUnverified) {
    return { status: auditedStatus, score: auditedScore, claims };
  }

  // Weight the audited score by how much of the answer could be audited.
  const score = Math.round((auditedScore * auditable.length) / claims.length);
  const status: OverallStatus = auditable.length === 0 ? 'unverified' : 'partial';
  return { status, score, claims };
}

export function verifierModel(): string {
  return llmModel();
}
