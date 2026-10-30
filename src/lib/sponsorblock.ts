import { CATEGORIES } from "./categories"
import { hashPrefix, sha256Hex } from "./hash"
import type { Segment } from "./segment"

export const API_HOSTS = ["https://sponsor.ajay.app", "https://api.sponsor.ajay.app"] as const

const SKIP_ACTIONS = ["skip", "mute", "full", "poi"] as const

export function segmentsPath(prefix: string, categories: readonly string[]): string {
  const params = new URLSearchParams()
  params.set("categories", JSON.stringify([...categories]))
  params.set("actionTypes", JSON.stringify([...SKIP_ACTIONS]))
  return `/api/skipSegments/${prefix}?${params.toString()}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parseOne(value: unknown): Segment | null {
  if (!isRecord(value)) return null
  const raw = value.segment
  if (!Array.isArray(raw) || raw.length < 2) return null
  const start = Number(raw[0])
  const end = Number(raw[1])
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  const category = typeof value.category === "string" && value.category ? value.category : ""
  if (!category) return null
  const actionType = typeof value.actionType === "string" && value.actionType ? value.actionType : "skip"
  if (actionType !== "poi" && end <= start) return null
  if (actionType === "poi" && end < start) return null
  const uuid =
    typeof value.UUID === "string" && value.UUID
      ? value.UUID
      : `${category}:${start.toFixed(3)}:${end.toFixed(3)}`
  const hinted = Number(value.videoDuration)
  return {
    uuid,
    category,
    actionType,
    start: Math.max(0, start),
    end: Math.max(0, end),
    ...(Number.isFinite(hinted) && hinted > 0 ? { videoDuration: hinted } : {}),
  }
}

export function parseSegments(value: unknown): Segment[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const segments: Segment[] = []
  for (const item of value) {
    const parsed = parseOne(item)
    if (!parsed || seen.has(parsed.uuid)) continue
    seen.add(parsed.uuid)
    segments.push(parsed)
  }
  segments.sort((a, b) => a.start - b.start || a.end - b.end)
  return segments
}

/**
 * The prefix response lists every video in the hash bucket.
 * Keep the one the viewer actually opened. When the server includes a full hash, it has to match too.
 */
export function selectSegments(body: unknown, videoId: string, fullHash: string): Segment[] {
  if (!Array.isArray(body)) return []
  const want = fullHash.toLowerCase()
  for (const entry of body) {
    if (!isRecord(entry)) continue
    const id = typeof entry.videoID === "string" ? entry.videoID : ""
    if (id !== videoId) continue
    const hash = typeof entry.hash === "string" ? entry.hash.toLowerCase() : ""
    if (hash && hash !== want) continue
    return parseSegments(entry.segments)
  }
  return []
}

export async function fetchSponsorSegments(
  videoId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Segment[]> {
  const prefix = await hashPrefix(videoId)
  const fullHash = await sha256Hex(videoId)
  const path = segmentsPath(prefix, CATEGORIES.map((category) => category.id))
  let lastError: Error | null = null

  for (const host of API_HOSTS) {
    let response: Response
    try {
      response = await fetchImpl(`${host}${path}`, { credentials: "omit", cache: "no-store" })
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("SponsorBlock request failed")
      continue
    }
    if (response.status === 404) return []
    if (response.status >= 500) {
      lastError = new Error(`SponsorBlock returned ${response.status}`)
      continue
    }
    if (!response.ok) {
      throw new Error(`SponsorBlock returned ${response.status}`)
    }
    const body: unknown = await response.json()
    return selectSegments(body, videoId, fullHash)
  }

  throw lastError ?? new Error("SponsorBlock request failed")
}
