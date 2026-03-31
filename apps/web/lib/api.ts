export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '') ?? 'http://localhost:3001/api';

export type ApiError = { error: { code: string; message: string; details?: unknown } };

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const url = `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
  const headers = new Headers(options.headers);
  // 只有在确实有 body 时才声明 JSON。
  // 否则像 DELETE(无 body) 会触发服务端报错：
  // "Body cannot be empty when content-type is set to 'application/json'"
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  const res = await fetch(url, { ...options, headers, cache: 'no-store' });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { code?: string; status?: number; details?: unknown };
    err.code = json?.error?.code;
    err.status = res.status;
    err.details = json?.error?.details;
    throw err;
  }
  return (json?.data ?? json) as T;
}

