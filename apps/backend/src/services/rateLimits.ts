/**
 * Provider rate-limit tracking.
 *
 * OpenAI-compatible providers report the API key's current limits on every
 * response via `x-ratelimit-*` headers (requests/min, tokens/min, remaining,
 * reset). We keep the latest snapshot per model so the client can show how
 * much of the key's allowance is left. Nothing here limits the app: it only
 * reports what the provider says.
 */

export type RateLimitBucket = {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
};

export type ProviderLimits = {
  available: true;
  model: string;
  provider: string;
  requests: RateLimitBucket;
  tokens: RateLimitBucket;
  updatedAt: string;
};

export type UsageSnapshot = ProviderLimits | { available: false };

const EMPTY_BUCKET: RateLimitBucket = { limit: null, remaining: null, resetAt: null };

const snapshots = new Map<string, ProviderLimits>();
let latestModel: string | null = null;

function providerName(baseUrl: string): string {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}

function toNumber(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Reset values arrive as a duration ("6ms", "1s", "2m"), an epoch seconds
 * value ("1756243200") or an epoch millisecond value. Normalize all to ISO. */
function toResetAt(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();

  // A duration always carries a unit ("6ms", "1s", "2m"); a bare number is an
  // epoch value (large) or seconds-from-now (small).
  const duration = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(trimmed);
  if (duration) {
    const amount = Number(duration[1]);
    const unit = duration[2];
    const ms = unit === 'ms' ? amount : unit === 's' ? amount * 1000 : unit === 'm' ? amount * 60_000 : amount * 3_600_000;
    return new Date(Date.now() + ms).toISOString();
  }

  const numeric = Number(trimmed);
  if (Number.isFinite(numeric)) {
    // Epoch milliseconds (>1e12), epoch seconds (>1e9), else seconds from now.
    if (numeric > 1e12) return new Date(numeric).toISOString();
    if (numeric > 1e9) return new Date(numeric * 1000).toISOString();
    return new Date(Date.now() + numeric * 1000).toISOString();
  }
  return null;
}

function readHeader(headers: Headers | undefined | null, name: string): string | null {
  if (!headers || typeof headers.get !== 'function') return null;
  return headers.get(name);
}

/** Parse provider rate-limit headers into a normalized snapshot. */
export function recordProviderLimits(
  model: string,
  baseUrl: string,
  headers: Headers | undefined | null
): ProviderLimits | null {
  const requests: RateLimitBucket = {
    limit: toNumber(readHeader(headers, 'x-ratelimit-limit-requests')),
    remaining: toNumber(readHeader(headers, 'x-ratelimit-remaining-requests')),
    resetAt:
      toResetAt(readHeader(headers, 'x-ratelimit-reset-requests')) ??
      toResetAt(readHeader(headers, 'x-ratelimit-reset'))
  };
  const tokens: RateLimitBucket = {
    limit: toNumber(readHeader(headers, 'x-ratelimit-limit-tokens')),
    remaining: toNumber(readHeader(headers, 'x-ratelimit-remaining-tokens')),
    resetAt: toResetAt(readHeader(headers, 'x-ratelimit-reset-tokens'))
  };

  // IETF-style headers (some gateways) only carry a generic bucket.
  if (requests.limit === null && requests.remaining === null) {
    const genericLimit = toNumber(readHeader(headers, 'ratelimit-limit'));
    const genericRemaining = toNumber(readHeader(headers, 'ratelimit-remaining'));
    if (genericLimit !== null || genericRemaining !== null) {
      requests.limit = genericLimit;
      requests.remaining = genericRemaining;
      requests.resetAt = toResetAt(readHeader(headers, 'ratelimit-reset'));
    }
  }

  const hasData =
    requests.limit !== null ||
    requests.remaining !== null ||
    tokens.limit !== null ||
    tokens.remaining !== null;

  if (!hasData) return null;

  const snapshot: ProviderLimits = {
    available: true,
    model,
    provider: providerName(baseUrl),
    requests: requests.limit === null && requests.remaining === null && requests.resetAt === null
      ? EMPTY_BUCKET
      : requests,
    tokens: tokens.limit === null && tokens.remaining === null && tokens.resetAt === null
      ? EMPTY_BUCKET
      : tokens,
    updatedAt: new Date().toISOString()
  };
  snapshots.set(model, snapshot);
  latestModel = model;
  return snapshot;
}

export function getProviderLimits(): UsageSnapshot {
  if (!latestModel) return { available: false };
  return snapshots.get(latestModel) ?? { available: false };
}

export function resetProviderLimits(): void {
  snapshots.clear();
  latestModel = null;
}
