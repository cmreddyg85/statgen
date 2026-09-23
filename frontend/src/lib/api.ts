/**
 * Single API client for the browser.
 *
 * - Always same-origin (`/api/v1/...`), proxied to the Node API by Next.js.
 * - Credentials are the HttpOnly session cookie; no token is ever kept in
 *   localStorage or sessionStorage (PRD 8.2).
 * - The CSRF token is read from its readable cookie and echoed in a header on
 *   every state-changing call.
 * - A 401 tears down client state and sends the browser to Login once.
 */

export const API_BASE = '/api/v1';

export interface ApiErrorBody {
  code: string;
  message: string;
  fields?: Record<string, string>;
  requestId?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields?: Record<string, string>;
  readonly requestId?: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code;
    this.fields = body.fields;
    this.requestId = body.requestId;
  }

  get isSessionProblem(): boolean {
    return this.status === 401;
  }
}

const CSRF_COOKIE = 'app_csrf';

function readCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((entry) => entry.startsWith(`${CSRF_COOKIE}=`));
  return match ? decodeURIComponent(match.slice(CSRF_COOKIE.length + 1)) : null;
}

type SessionExpiredListener = (reason: 'session_expired' | 'unauthenticated') => void;

let sessionExpiredListener: SessionExpiredListener | null = null;

/** Registered once by the session provider. */
export function onSessionInvalid(listener: SessionExpiredListener): () => void {
  sessionExpiredListener = listener;
  return () => {
    sessionExpiredListener = null;
  };
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** A FormData body is sent as-is so the browser sets the multipart boundary. */
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** Set for the login call, which handles its own 401 messaging. */
  skipSessionHandling?: boolean;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, skipSessionHandling } = options;

  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
  }

  const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined && !isMultipart) headers['Content-Type'] = 'application/json';

  if (method !== 'GET') {
    const csrfToken = readCsrfToken();
    if (csrfToken) headers['x-csrf-token'] = csrfToken;
  }

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
      body: body === undefined ? undefined : isMultipart ? (body as FormData) : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error;
    throw new ApiError(0, {
      code: 'NETWORK_ERROR',
      message: 'Could not reach the server. Check your connection and try again.',
    });
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const errorBody: ApiErrorBody = payload?.error ?? {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong. Please try again.',
    };

    if (response.status === 401 && !skipSessionHandling) {
      sessionExpiredListener?.(
        errorBody.code === 'SESSION_EXPIRED' ? 'session_expired' : 'unauthenticated',
      );
    }

    throw new ApiError(response.status, errorBody);
  }

  return payload as T;
}

/**
 * Posts JSON and hands back the response body as a Blob. Used for the
 * endpoints that answer with a file rather than JSON.
 */
export async function apiBlob(path: string, body: unknown): Promise<Blob> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const csrfToken = readCsrfToken();
  if (csrfToken) headers['x-csrf-token'] = csrfToken;

  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new ApiError(
      response.status,
      payload?.error ?? {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong. Please try again.',
      },
    );
  }

  return response.blob();
}

/** Saves a blob to the visitor's downloads. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/**
 * Routes a failed request into a form's state: field errors when the server
 * named the fields, a single form-level message otherwise.
 */
export function applyApiError(
  error: unknown,
  setFieldErrors: (fields: Record<string, string>) => void,
  setFormError: (message: string | null) => void,
): void {
  if (error instanceof ApiError) {
    setFieldErrors(error.fields ?? {});
    setFormError(error.fields ? null : error.message);
    return;
  }
  setFieldErrors({});
  setFormError('Something went wrong. Please try again.');
}

export const api = {
  get: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, 'method'>) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, 'method' | 'body'>) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};
