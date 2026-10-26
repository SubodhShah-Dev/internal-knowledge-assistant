jest.mock('../src/services/llm', () => {
  const actual = jest.requireActual('../src/services/llm');
  return { ...actual, chat: jest.fn() };
});

import { chat } from '../src/services/llm';
import { parseClaims, verifyAnswer } from '../src/services/verifyAnswer';
import type { Source } from '../src/routes/questions.types';

const mockChat = chat as jest.MockedFunction<typeof chat>;

const SOURCES: Source[] = [
  {
    label: 'S1',
    documentId: 'doc-1',
    title: 'handbook',
    chunkIndex: 0,
    excerpt: 'Employees receive 20 days of paid annual leave per year.'
  },
  {
    label: 'S2',
    documentId: 'doc-1',
    title: 'handbook',
    chunkIndex: 1,
    excerpt: 'Requests must be submitted two weeks in advance.'
  }
];

beforeEach(() => {
  mockChat.mockReset();
});

describe('parseClaims', () => {
  test('splits sentences and extracts S-labels', () => {
    const claims = parseClaims('Employees get 20 days of leave [S1]. Requests need two weeks notice [S2].');
    expect(claims).toHaveLength(2);
    expect(claims[0].sourceLabels).toEqual(['S1']);
    expect(claims[1].sourceLabels).toEqual(['S2']);
  });

  test('folds short fragments into the previous claim', () => {
    const claims = parseClaims('Employees get 20 days of leave [S1]. Yes. [S1]');
    expect(claims).toHaveLength(1);
    expect(claims[0].text).toContain('Yes');
    expect(claims[0].sourceLabels).toEqual(['S1']);
  });

  test('deduplicates repeated labels within a claim', () => {
    const claims = parseClaims('Policy applies [S1] and also [S1].');
    expect(claims[0].sourceLabels).toEqual(['S1']);
  });

  test('handles multiline answers', () => {
    const claims = parseClaims('First line claim [S1].\nSecond line claim [S2].');
    expect(claims).toHaveLength(2);
  });

  test('detects citations even with zero-width spaces inside brackets', () => {
    const claims = parseClaims('Employees get 20 days of leave [​S1].');
    expect(claims[0].sourceLabels).toEqual(['S1']);
  });

  test('normalizes fullwidth CJK citation brackets 【S1】', () => {
    const claims = parseClaims('Employees get 20 days of leave 【S1】.');
    expect(claims[0].sourceLabels).toEqual(['S1']);
    expect(claims[0].text).toContain('[S1]');
  });

  test('normalizes fullwidth square-bracket citations ［S2］', () => {
    const claims = parseClaims('Requests need two weeks notice ［ S2 ］.');
    expect(claims[0].sourceLabels).toEqual(['S2']);
  });

  test('normalizes mixed ASCII and fullwidth citations in one answer', () => {
    const claims = parseClaims('Employees get 20 days [S1]. Managers approve requests 【S2】.');
    expect(claims).toHaveLength(2);
    expect(claims[0].sourceLabels).toEqual(['S1']);
    expect(claims[1].sourceLabels).toEqual(['S2']);
  });

  test('returns empty for empty answers', () => {
    expect(parseClaims('')).toEqual([]);
  });
});

describe('verifyAnswer', () => {
  test('marks all claims supported when the verifier says so', async () => {
    mockChat.mockResolvedValue('[{"id": 0, "status": "supported"}, {"id": 1, "status": "supported"}]');

    const result = await verifyAnswer(
      'Employees get 20 days of leave [S1]. Requests need two weeks notice [S2].',
      SOURCES
    );

    expect(result.status).toBe('verified');
    expect(result.score).toBe(100);
    expect(result.claims.every(c => c.status === 'supported')).toBe(true);
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  test('reports partial when support is mixed', async () => {
    mockChat.mockResolvedValue('[{"id": 0, "status": "supported"}, {"id": 1, "status": "unsupported"}]');

    const result = await verifyAnswer(
      'Employees get 20 days of leave [S1]. Unlimited sick days are allowed [S2].',
      SOURCES
    );

    expect(result.status).toBe('partial');
    expect(result.score).toBe(50);
    expect(result.claims[1].status).toBe('unsupported');
  });

  test('flags claims citing unknown source labels without asking the LLM', async () => {
    mockChat.mockResolvedValue('[{"id": 0, "status": "supported"}]');

    const result = await verifyAnswer(
      'Employees get 20 days of leave [S1]. Pets get free healthcare [S99].',
      SOURCES
    );

    const badClaim = result.claims.find(c => c.sourceLabels.includes('S99'));
    expect(badClaim?.status).toBe('unsupported');
    // Only the sound claim is sent to the verifier.
    expect(mockChat).toHaveBeenCalledTimes(1);
  });

  test('degrades to unverified when the verifier LLM fails', async () => {
    const { LlmUnavailableError } = jest.requireActual('../src/services/llm');
    mockChat.mockRejectedValue(new LlmUnavailableError('down'));

    const result = await verifyAnswer('Employees get 20 days of leave [S1].', SOURCES);

    expect(result.status).toBe('unverified');
    expect(result.score).toBe(0);
    expect(result.claims[0].status).toBe('unverified');
  });

  test('degrades to unverified on malformed verifier JSON', async () => {
    mockChat.mockResolvedValue('I refuse to answer in JSON.');

    const result = await verifyAnswer('Employees get 20 days of leave [S1].', SOURCES);

    expect(result.status).toBe('unverified');
    expect(result.claims[0].status).toBe('unverified');
  });

  test('marks claims without any citation as uncited and never calls the verifier', async () => {
    const result = await verifyAnswer(
      'Employees get twenty days of paid annual leave. Pets get free healthcare coverage.',
      SOURCES
    );

    expect(result.status).toBe('unsupported');
    expect(result.score).toBe(0);
    expect(result.claims.every(c => c.status === 'uncited')).toBe(true);
    expect(mockChat).not.toHaveBeenCalled();
  });

  test('skips the verifier entirely when there are no sources', async () => {
    const result = await verifyAnswer('Employees get 20 days of leave [S1].', []);
    expect(result.status).toBe('unverified');
    expect(mockChat).not.toHaveBeenCalled();
  });

  test('extracts JSON even when wrapped in code fences', async () => {
    mockChat.mockResolvedValue('```json\n[{"id": 0, "status": "supported"}]\n```');

    const result = await verifyAnswer('Employees get 20 days of leave [S1].', SOURCES);

    expect(result.status).toBe('verified');
    expect(result.score).toBe(100);
  });

  test('scores fullwidth-cited claims instead of marking them uncited', async () => {
    mockChat.mockResolvedValue('[{"id": 0, "status": "supported"}]');

    const result = await verifyAnswer('Employees get 20 days of leave 【S1】.', SOURCES);

    expect(result.status).toBe('verified');
    expect(result.score).toBe(100);
    expect(result.claims[0].status).toBe('supported');
    expect(mockChat).toHaveBeenCalledTimes(1);
  });
});
