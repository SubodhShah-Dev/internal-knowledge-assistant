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

function readConfig(): LlmConfig {
  return {
    baseUrl: (process.env.LLM_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || 'openai/gpt-oss-120b',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS || 60000)
  };
}

export function llmModel(): string {
  return readConfig().model;
}

export async function chat(
  messages: ChatMessage[],
  options: { temperature?: number } = {}
): Promise<string> {
  const { baseUrl, apiKey, model, timeoutMs } = readConfig();
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
