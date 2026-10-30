import type { Segment } from "./segment"

export interface CacheEntry {
  at: number
  segments: Segment[]
}

export type SegmentCache = Record<string, CacheEntry>

export const CACHE_KEY = "segmentCache"
export const CACHE_TTL_MS = 30 * 60 * 1000
export const EMPTY_TTL_MS = 10 * 60 * 1000
export const CACHE_LIMIT = 80

export function readCached(cache: SegmentCache, videoId: string, now: number): Segment[] | undefined {
  const entry = cache[videoId]
  if (!entry || typeof entry.at !== "number" || !Array.isArray(entry.segments)) return undefined
  const ttl = entry.segments.length === 0 ? EMPTY_TTL_MS : CACHE_TTL_MS
  if (now - entry.at > ttl) return undefined
  return entry.segments
}

export function writeCached(cache: SegmentCache, videoId: string, segments: Segment[], now: number): SegmentCache {
  const next: SegmentCache = { ...cache, [videoId]: { at: now, segments } }
  const ids = Object.keys(next)
  if (ids.length <= CACHE_LIMIT) return next
  ids.sort((a, b) => next[a].at - next[b].at)
  for (const id of ids.slice(0, ids.length - CACHE_LIMIT)) delete next[id]
  return next
}
