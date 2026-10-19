process.env.LLM_BASE_URL = 'https://api.example.com/v1';
process.env.LLM_API_KEY = 'key-123';
process.env.LLM_MODEL = 'test-model';
process.env.LLM_TIMEOUT_MS = '5000';

import { chat, LlmUnavailableError } from '../src/services/llm';

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  jest.resetAllMocks();
});

test('POSTs to /chat/completions with auth header and returns trimmed content', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '  hello there  ' } }] })
  });

  const out = await chat([{ role: 'user', content: 'hi' }], { temperature: 0 });

  expect(out).toBe('hello there');
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe('https://api.example.com/v1/chat/completions');
  expect(init.headers.Authorization).toBe('Bearer key-123');
  const body = JSON.parse(init.body);
  expect(body.model).toBe('test-model');
  expect(body.temperature).toBe(0);
  expect(body.stream).toBe(false);
});

test('wraps provider HTTP errors in LlmUnavailableError', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 503,
    text: async () => 'provider overloaded'
  });

  await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(LlmUnavailableError);
  await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/503/);
});

test('wraps network failures in LlmUnavailableError', async () => {
  fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

  await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(LlmUnavailableError);
  await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/ECONNREFUSED/);
});

test('maps AbortSignal timeouts to a timeout message', async () => {
  const timeoutError = new Error('The operation was aborted');
  timeoutError.name = 'TimeoutError';
  fetchMock.mockRejectedValue(timeoutError);

  await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/timed out after 5000ms/);
});

test('rejects empty or malformed completions', async () => {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '   ' } }] })
  });

  await expect(chat([{ role: 'user', content: 'hi' }])).rejects.toThrow(/empty or malformed/);
});
