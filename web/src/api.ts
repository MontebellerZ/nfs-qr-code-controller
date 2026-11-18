export interface User {
  id: string;
  email: string;
}

export interface Invoice {
  id: string;
  accessKey: string;
  fileName: string;
  createdAt: string;
  completedAt: string | null;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function isProblem(value: unknown): value is { detail?: string; title?: string } {
  return typeof value === 'object' && value !== null &&
    (!('detail' in value) || typeof value.detail === 'string') &&
    (!('title' in value) || typeof value.title === 'string');
}

export async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      credentials: 'same-origin',
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new Error('Não foi possível conectar à API. Verifique a conexão e tente novamente.');
  }
  if (!response.ok) {
    let message = response.status === 413
      ? 'Arquivo muito grande. O limite é 10 MB.'
      : `Não foi possível concluir a operação (HTTP ${response.status}).`;
    if (response.headers.get('content-type')?.includes('json')) {
      const problem: unknown = await response.json();
      if (isProblem(problem)) message = problem.detail || problem.title || message;
    }
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function post<T>(path: string, body?: FormData | object): Promise<T> {
  const { token } = await request<{ token: string }>('/auth/csrf');
  const headers: Record<string, string> = { 'X-CSRF-TOKEN': token };
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  return request<T>(path, { method: 'POST', headers, body: payload });
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Ocorreu um erro. Tente novamente.';
