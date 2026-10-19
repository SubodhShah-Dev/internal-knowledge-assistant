import type { AskResponse, AuthResponse, DocumentMeta } from '../types';

// Relative by default: Vite's dev server proxies /api to the backend, and a
// same-origin production deploy needs no CORS. Override with VITE_API_URL.
const API = import.meta.env.VITE_API_URL ?? '/api';

const TOKEN_KEY = 'token';

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

export async function askQuestion(question: string): Promise<AskResponse> {
  return apiFetch<AskResponse>('/questions', {
    method: 'POST',
    body: JSON.stringify({ question })
  });
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
