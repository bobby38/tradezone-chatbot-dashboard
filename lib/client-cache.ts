type CacheEntry<T = any> = {
  data: T
  expiresAt: number
}

const store = new Map<string, CacheEntry>()

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
  const hit = store.get(url)
  if (hit && hit.expiresAt > now) {
    return hit.data as T
  }

  const res = await fetch(url, options)
  const json = await res.json()

  if (res.ok) {
    store.set(url, { data: json, expiresAt: now + ttlMs })
  }

  if (!res.ok) {
    // Do not cache error responses; propagate error like fetch().json()
    throw new Error((json && (json.error || json.message)) || `Request failed: ${res.status}`)
  }

  return json as T
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
