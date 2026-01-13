import { http } from '@/api/http'

type CacheEntry = {
  data: any[]
  fetchedAt: number
}

const cache = new Map<string, CacheEntry>()
const TTL = 30_000

export async function fetchPipelineData(accountId: string, force = false) {
  if (!accountId) return { data: [], fromCache: false }
  const key = accountId
  const now = Date.now()
  const cached = cache.get(key)
  if (!force && cached && now - cached.fetchedAt < TTL) {
    return { data: cached.data, fromCache: true }
  }

  const resp = await http.get('/whatsapp/conversations', { params: { accountId } })
  const data = Array.isArray(resp.data) ? resp.data : []
  cache.set(key, { data, fetchedAt: now })
  return { data, fromCache: false }
}

export function invalidatePipelineCache(accountId: string) {
  cache.delete(accountId)
}
