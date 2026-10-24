/**
 * OpenAI-compatible chat client.
 *
 * Works with any provider that speaks the /chat/completions protocol:
 * Groq, Google Gemini (OpenAI-compat endpoint), OpenRouter, Cerebras,
 * and local Ollama (http://127.0.0.1:11434/v1). Configure via env vars:
 *
 *   LLM_BASE_URL  - provider base URL (no trailing slash required)
 *   LLM_API_KEY   - bearer token; not required for local Ollama
 *   LLM_MODEL     - model id the provider accepts
 *   LLM_TIMEOUT_MS - per-request timeout (default 60s)
 */

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export class LlmUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LlmUnavailableError';
  }
}

type LlmConfig = {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

function readConfig(override?: Partial<LlmConfig>): LlmConfig {
  const base = {
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'openai/gpt-oss-120b',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 60000)
  };
  return { ...base, ...override };
}

export function llmModel(): string {
  return readConfig().model;
}

export async function chat(
  messages: ChatMessage[],
  options: { temperature?: number; modelConfig?: Partial<LlmConfig> } = {}
): Promise<string> {
  const { baseUrl, apiKey, model, timeoutMs } = readConfig(options.modelConfig);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.1,
        stream: false
      })
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new LlmUnavailableError(`LLM request timed out after ${timeoutMs}ms.`);
    }
    throw new LlmUnavailableError(`Could not reach the LLM provider at ${baseUrl}: ${error?.message ?? 'network error'}`);
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new LlmUnavailableError(`LLM provider responded ${response.status}. ${detail}`);
  }

  const data: any = await response.json().catch(() => null);
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new LlmUnavailableError('LLM provider returned an empty or malformed response.');
  }
  return content.trim();
}

/**
 * Streaming variant of chat(): same protocol with stream:true. Yields
 * content deltas as they arrive. Throws LlmUnavailableError on connect
 * failure; mid-stream provider failures also surface as
 * LlmUnavailableError so callers can degrade uniformly.
 */
export async function* chatStream(
  messages: ChatMessage[],
  options: { temperature?: number; signal?: AbortSignal; modelConfig?: Partial<LlmConfig> } = {}
): AsyncGenerator<string> {
  const { baseUrl, apiKey, model, timeoutMs } = readConfig(options.modelConfig);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const signals: AbortSignal[] = [AbortSignal.timeout(timeoutMs)];
  if (options.signal) signals.push(options.signal);
  const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature ?? 0.1,
        stream: true
      })
    });
  } catch (error: any) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new LlmUnavailableError(`LLM request timed out after ${timeoutMs}ms.`);
    }
    throw new LlmUnavailableError(`Could not reach the LLM provider at ${baseUrl}: ${error?.message ?? 'network error'}`);
  }

  if (!response.ok || !response.body) {
    const detail = (await response.text().catch(() => '')).slice(0, 300);
    throw new LlmUnavailableError(`LLM provider responded ${response.status}. ${detail}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let emitted = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line; tolerate bare "data:" lines too.
      const frames = buffer.split(/\r?\n/);
      buffer = frames.pop() ?? '';
      for (const line of frames) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload);
          const delta = parsed?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta.length > 0) {
            emitted = true;
            yield delta;
          }
        } catch {
          // ignore malformed keep-alive/comment frames
        }
      }
    }
  } catch (error: any) {
    if (error instanceof LlmUnavailableError) throw error;
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      // Client-initiated abort (stop button) is not a provider outage;
      // rethrow so callers can check the signal, otherwise map to LLM error.
      if (options.signal?.aborted) throw error;
      throw new LlmUnavailableError(`LLM stream timed out after ${timeoutMs}ms.`);
    }
    throw new LlmUnavailableError(`LLM stream failed: ${error?.message ?? 'network error'}`);
  }

  if (!emitted) {
    throw new LlmUnavailableError('LLM provider returned an empty stream.');
  }
}
