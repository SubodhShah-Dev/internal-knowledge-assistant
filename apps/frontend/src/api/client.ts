import type {
  AskResponse,
  AuthResponse,
  ConversationDetail,
  ConversationSummary,
  DocumentMeta,
  Source,
  Verification
} from '../types';

// Relative by default: Vite's dev server proxies /api to the backend, and a
// same-origin production deploy needs no CORS. Override with VITE_API_URL.
const API = import.meta.env.VITE_API_URL ?? '/api';

const TOKEN_KEY = 'token';
const ADMIN_TOKEN_KEY = 'admin_token';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? '';
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export function getAdminToken(): string {
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}

export function setAdminToken(token: string): void {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is the API running?');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? `Request failed (${response.status}).`);
  }
  return data as T;
}

async function apiAdminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  const token = getAdminToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Is the API running?');
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status, data?.error ?? `Request failed (${response.status}).`);
  }
  return data as T;
}

export type AdminModel = {
  id: string;
  label: string;
  model_id: string;
  base_url: string | null;
  is_enabled: boolean;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  has_api_key: boolean;
};

export async function listAdminModels(): Promise<AdminModel[]> {
  return apiAdminFetch<AdminModel[]>('/admin/models');
}

export async function createAdminModel(model: {
  label: string;
  model_id: string;
  base_url?: string | null;
  api_key?: string | null;
  is_enabled?: boolean;
  is_default?: boolean;
  sort_order?: number;
}): Promise<AdminModel> {
  return apiAdminFetch<AdminModel>('/admin/models', {
    method: 'POST',
    body: JSON.stringify(model)
  });
}

export async function updateAdminModel(id: string, model: Partial<{
  label: string;
  model_id: string;
  base_url: string | null;
  api_key: string | null;
  is_enabled: boolean;
  is_default: boolean;
  sort_order: number;
}>): Promise<AdminModel> {
  return apiAdminFetch<AdminModel>(`/admin/models/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(model)
  });
}

export async function deleteAdminModel(id: string): Promise<void> {
  await apiAdminFetch<void>(`/admin/models/${id}`, { method: 'DELETE' });
}

export async function testAdminModel(id: string): Promise<{ ok: boolean; error?: string }> {
  return apiAdminFetch<{ ok: boolean; error?: string }>(`/admin/models/${id}/test`, {
    method: 'POST'
  });
}

export async function getAdminSettings(): Promise<Record<string, string>> {
  return apiAdminFetch<Record<string, string>>('/admin/settings');
}

export async function updateAdminSettings(settings: Record<string, string>): Promise<{ ok: boolean }> {
  return apiAdminFetch<{ ok: boolean }>('/admin/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
}

export async function getEnabledModels(): Promise<Array<{ id: string; label: string; model_id: string; is_default: boolean }>> {
  return apiFetch<Array<{ id: string; label: string; model_id: string; is_default: boolean }>>('/models');
}

export async function signup(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
}

export async function uploadDocument(file: File): Promise<{ document: DocumentMeta; chunkCount: number }> {
  const form = new FormData();
  form.append('file', file);
  // Do not set Content-Type: the browser must add the multipart boundary.
  return apiFetch('/documents', { method: 'POST', body: form });
}

export async function listDocuments(): Promise<DocumentMeta[]> {
  return apiFetch<DocumentMeta[]>('/documents');
}

export async function askQuestion(question: string, conversationId?: number, documentIds?: string[], modelId?: string): Promise<AskResponse> {
  return apiFetch<AskResponse>('/questions', {
    method: 'POST',
    body: JSON.stringify({ question, conversationId, documentIds, modelId })
  });
}

// Postgres bigint columns serialize as JSON strings; normalize ids/counts.
export async function listConversations(): Promise<ConversationSummary[]> {
  const rows = await apiFetch<ConversationSummary[]>('/conversations');
  return rows.map(row => ({ ...row, id: Number(row.id), message_count: Number(row.message_count) }));
}

export async function getConversation(id: number): Promise<ConversationDetail> {
  const detail = await apiFetch<ConversationDetail>(`/conversations/${id}`);
  return {
    ...detail,
    id: Number(detail.id),
    turns: detail.turns.map(turn => ({ ...turn, id: Number(turn.id) }))
  };
}

export async function renameConversation(id: number, title: string): Promise<ConversationSummary> {
  const row = await apiFetch<ConversationSummary>(`/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ title })
  });
  return { ...row, id: Number(row.id), message_count: Number(row.message_count) };
}

export async function deleteConversation(id: number): Promise<void> {
  await apiFetch<{ ok: boolean }>(`/conversations/${id}`, { method: 'DELETE' });
}

export async function attachDocument(conversationId: number, documentId: string): Promise<void> {
  await apiFetch<void>(`/conversations/${conversationId}/documents`, {
    method: 'POST',
    body: JSON.stringify({ documentId })
  });
}

export async function detachDocument(conversationId: number, documentId: string): Promise<void> {
  await apiFetch<void>(`/conversations/${conversationId}/documents/${documentId}`, {
    method: 'DELETE'
  });
}

export async function deleteDocument(documentId: string): Promise<void> {
  await apiFetch<void>(`/documents/${documentId}`, { method: 'DELETE' });
}

export type StreamHandlers = {
  onSources?: (sources: Source[]) => void;
  onToken?: (text: string) => void;
  onVerification?: (verification: Verification) => void;
  onDone?: (payload: { conversationId: number; messageId: number; answer: string; model?: string }) => void;
  onError?: (message: string) => void;
  signal?: AbortSignal;
};

/**
 * Ask a question and consume the SSE answer stream.
 * Resolves when the server ends the stream; rejects with ApiError on
 * HTTP-level failures (400/401/503 before the stream starts).
 */
export async function askQuestionStream(
  question: string,
  conversationId: number | undefined,
  handlers: StreamHandlers,
  documentIds?: string[],
  modelId?: string
): Promise<void> {
  const headers = new Headers({ 'Content-Type': 'application/json', Accept: 'text/event-stream' });
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API}/questions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ question, conversationId, documentIds, modelId }),
      signal: handlers.signal ?? null
    });
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError(0, 'Could not reach the server. Is the API running?');
  }

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error ?? `Request failed (${response.status}).`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/event-stream') || !response.body) {
    // Server fell back to JSON (shouldn't happen with our Accept header).
    const data = (await response.json().catch(() => null)) as AskResponse | null;
    if (!data) throw new ApiError(0, 'Empty response from server.');
    handlers.onSources?.(data.sources);
    handlers.onToken?.(data.answer);
    if (data.verification) handlers.onVerification?.(data.verification);
    handlers.onDone?.({
      conversationId: Number(data.conversationId ?? 0),
      messageId: Number(data.messageId ?? 0),
      answer: data.answer
    });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const dispatch = (frame: string) => {
    let event = 'message';
    let data = '';
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data += line.slice(5).trim();
    }
    if (!data) return;
    let parsed: any;
    try {
      parsed = JSON.parse(data);
    } catch {
      return;
    }
    switch (event) {
      case 'sources':
        handlers.onSources?.(parsed.sources as Source[]);
        break;
      case 'token':
        handlers.onToken?.(String(parsed.text ?? ''));
        break;
      case 'verification':
        handlers.onVerification?.(parsed.verification as Verification);
        break;
      case 'done':
        handlers.onDone?.({
          conversationId: Number(parsed.conversationId),
          messageId: Number(parsed.messageId),
          answer: String(parsed.answer ?? ''),
          model: parsed.model ?? undefined
        });
        break;
      case 'error':
        handlers.onError?.(String(parsed.message ?? 'Stream failed.'));
        break;
    }
  };

  for (;;) {
    let chunk: ReadableStreamReadResult<Uint8Array>;
    try {
      chunk = await reader.read();
    } catch (error: any) {
      if (error?.name === 'AbortError') throw error;
      throw new ApiError(0, 'The answer stream was interrupted.');
    }
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const frames = buffer.split(/\n\n/);
    buffer = frames.pop() ?? '';
    for (const frame of frames) dispatch(frame);
  }
  if (buffer.trim()) dispatch(buffer);
}

export async function downloadDocument(doc: DocumentMeta): Promise<void> {
  const headers = new Headers();
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API}/documents/${doc.id}/file`, { headers });
  } catch {
    throw new ApiError(0, 'Could not reach the server to download the file.');
  }
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error ?? 'Download failed.');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = doc.original_name;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
