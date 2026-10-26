import { chat } from '../src/services/llm';
import {
  getProviderLimits,
  recordProviderLimits,
  resetProviderLimits
} from '../src/services/rateLimits';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  jest.resetAllMocks();
  resetProviderLimits();
});

test('parses provider x-ratelimit headers into requests and tokens buckets', () => {
  const snapshot = recordProviderLimits(
    'openai/gpt-oss-120b',
    'https://api.groq.com/openai/v1',
    new Headers({
      'x-ratelimit-limit-requests': '30',
      'x-ratelimit-remaining-requests': '29',
      'x-ratelimit-reset-requests': '6ms',
      'x-ratelimit-limit-tokens': '14400',
      'x-ratelimit-remaining-tokens': '12000',
      'x-ratelimit-reset-tokens': '1m'
    })
  );

  expect(snapshot).not.toBeNull();
  expect(snapshot?.model).toBe('openai/gpt-oss-120b');
  expect(snapshot?.provider).toBe('api.groq.com');
  expect(snapshot?.requests.limit).toBe(30);
  expect(snapshot?.requests.remaining).toBe(29);
  expect(snapshot?.tokens.limit).toBe(14400);
  expect(snapshot?.tokens.remaining).toBe(12000);
});

test('normalizes duration resets to a future timestamp', () => {
  const snapshot = recordProviderLimits(
    'model-x',
    'https://api.example.com/v1',
    new Headers({
      'x-ratelimit-limit-requests': '10',
      'x-ratelimit-remaining-requests': '9',
      'x-ratelimit-reset-requests': '42s'
    })
  );

  const reset = new Date(snapshot!.requests.resetAt!).getTime();
  expect(reset).toBeGreaterThan(Date.now());
  expect(reset).toBeLessThan(Date.now() + 60_000);
});

test('normalizes epoch reset values to a timestamp', () => {
  const epoch = Math.floor(Date.now() / 1000) + 30;
  const snapshot = recordProviderLimits(
    'model-y',
    'https://api.example.com/v1',
    new Headers({
      'x-ratelimit-limit-requests': '10',
      'x-ratelimit-remaining-requests': '9',
      'x-ratelimit-reset': String(epoch)
    })
  );

  expect(new Date(snapshot!.requests.resetAt!).getTime()).toBeCloseTo(epoch * 1000, -2);
});

test('falls back to IETF-style ratelimit headers', () => {
  const snapshot = recordProviderLimits(
    'model-z',
    'https://api.example.com/v1',
    new Headers({
      'ratelimit-limit': '100',
      'ratelimit-remaining': '98',
      'ratelimit-reset': '12'
    })
  );

  expect(snapshot?.requests.limit).toBe(100);
  expect(snapshot?.requests.remaining).toBe(98);
});

test('returns nothing when the provider reports no limits', () => {
  expect(recordProviderLimits('model-none', 'https://api.example.com/v1', new Headers())).toBeNull();
  expect(getProviderLimits()).toEqual({ available: false });
});

test('captures provider limits from a live LLM response', async () => {
  process.env.LLM_BASE_URL = 'https://api.groq.com/openai/v1';
  process.env.LLM_MODEL = 'openai/gpt-oss-120b';
  fetchMock.mockResolvedValue({
    ok: true,
    headers: new Headers({
      'x-ratelimit-limit-requests': '30',
      'x-ratelimit-remaining-requests': '27',
      'x-ratelimit-limit-tokens': '14400',
      'x-ratelimit-remaining-tokens': '10000'
    }),
    json: async () => ({ choices: [{ message: { content: 'hello' } }] })
  });

  await chat([{ role: 'user', content: 'hi' }]);

  const snapshot = getProviderLimits();
  expect(snapshot.available).toBe(true);
  if (snapshot.available) {
    expect(snapshot.model).toBe('openai/gpt-oss-120b');
    expect(snapshot.requests.remaining).toBe(27);
    expect(snapshot.tokens.limit).toBe(14400);
  }
});
