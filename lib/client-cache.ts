type CacheEntry<T = any> = {
  data: T
  expiresAt: number
}

const store = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<any>>()

function readSession<T>(key: string): CacheEntry<T> | undefined {
  try {
    if (typeof globalThis === 'undefined' || typeof (globalThis as any).sessionStorage === 'undefined') return undefined
    const raw = (globalThis as any).sessionStorage.getItem(`fwc:${key}`)
    if (!raw) return undefined
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return undefined
    return parsed as CacheEntry<T>
  } catch {
    return undefined
  }
}

function writeSession<T>(key: string, entry: CacheEntry<T>) {
  try {
    if (typeof globalThis === 'undefined' || typeof (globalThis as any).sessionStorage === 'undefined') return
    ;(globalThis as any).sessionStorage.setItem(`fwc:${key}`, JSON.stringify(entry))
  } catch {}
}

/**
 * Fetch JSON with a simple in-memory cache.
 * - Keyed by full URL (including querystring)
 * - TTL defaults to 5 minutes
 * - Only caches successful (2xx) responses
 */
export async function fetchWithCache<T = any>(
  url: string,
  options: RequestInit = {},
  ttlMs = 5 * 60 * 1000,
): Promise<T> {
  const now = Date.now()
  const hit = store.get(url) || readSession<T>(url)
  if (hit && hit.expiresAt > now) {
    return hit.data as T
  }

  // de-dupe concurrent requests for the same URL
  if (inflight.has(url)) {
    return inflight.get(url) as Promise<T>
  }

  const p = (async () => {
    const res = await fetch(url, options)
    const json = await res.json()
  
    if (res.ok) {
      const entry = { data: json, expiresAt: now + ttlMs }
      store.set(url, entry)
      writeSession(url, entry)
    }
  
    if (!res.ok) {
      // Do not cache error responses; propagate error like fetch().json()
      throw new Error((json && (json.error || json.message)) || `Request failed: ${res.status}`)
    }
  
    return json as T
  })()

  inflight.set(url, p)
  try {
    const out = await p
    return out
  } finally {
    inflight.delete(url)
  }
}

export function invalidateCache(urlPrefix?: string) {
  if (!urlPrefix) {
    store.clear()
    return
  }
  for (const key of store.keys()) {
    if (key.startsWith(urlPrefix)) store.delete(key)
  }
}

export function getCacheSize(): number {
  return store.size
}
