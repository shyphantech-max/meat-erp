/** Small fetch wrapper for the Catalyst API: JSON, bearer token, timeout, typed errors. */
import { API_URL } from './config'

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message)
  }
}

let token: string | null = null
export const setToken = (t: string | null) => (token = t)
export const getToken = () => token

export async function api<T>(path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 20000)
  try {
    // "simple" CORS request: token in the query string and a text/plain body, so browsers send no
    // preflight (works the same whatever the Catalyst gateway does with OPTIONS requests)
    const url = new URL(`${API_URL}${path}`)
    if (token) url.searchParams.set('t', token)
    const method = init.method ?? (init.body ? 'POST' : 'GET')
    const res = await fetch(url.toString(), {
      method,
      headers: method === 'POST' ? { 'Content-Type': 'text/plain;charset=UTF-8' } : undefined,
      body: init.body ? JSON.stringify(init.body) : method === 'POST' ? '{}' : undefined,
      signal: ctrl.signal,
    })
    const text = await res.text()
    const data = text ? JSON.parse(text) : {}
    if (!res.ok) throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status, data?.code)
    return data as T
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError((e as Error).name === 'AbortError' ? 'The server took too long to respond' : 'Cannot reach the server - check your connection', 0, 'NETWORK')
  } finally {
    clearTimeout(timer)
  }
}
