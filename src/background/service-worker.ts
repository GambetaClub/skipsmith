import { CACHE_KEY, readCached, writeCached, type SegmentCache } from "../lib/cache"
import { recordDebug } from "../lib/debug-log"
import { fetchSponsorSegments } from "../lib/sponsorblock"
import { adjustStats, resolveStats, SETTINGS_KEY, STATS_KEY, resolveSettings } from "../lib/settings"
import type { Segment } from "../lib/segment"

const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/

interface FetchMessage {
  type: "fetch-segments"
  videoId: string
}

interface StatsMessage {
  type: "adjust-stats"
  seconds: number
  skips: number
}

type BackgroundMessage = FetchMessage | StatsMessage

const inflight = new Map<string, Promise<Segment[]>>()
let statsChain: Promise<unknown> = Promise.resolve()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

async function readCache(): Promise<SegmentCache> {
  const stored = await chrome.storage.local.get(CACHE_KEY)
  const cache = stored[CACHE_KEY]
  if (!isRecord(cache)) return {}
  return cache as SegmentCache
}

async function loadSegments(videoId: string): Promise<Segment[]> {
  const pending = inflight.get(videoId)
  if (pending) return pending

  const request = (async () => {
    const cached = readCached(await readCache(), videoId, Date.now())
    if (cached) return cached
    const segments = await fetchSponsorSegments(videoId)
    const fresh = await readCache()
    await chrome.storage.local.set({ [CACHE_KEY]: writeCached(fresh, videoId, segments, Date.now()) })
    void recordDebug(
      "background",
      segments.length === 0 ? `SponsorBlock has no segments for ${videoId}` : `SponsorBlock returned ${segments.length} segments for ${videoId}`,
    )
    return segments
  })().finally(() => {
    inflight.delete(videoId)
  })

  inflight.set(videoId, request)
  return request
}

function adjust(seconds: number, skips: number): Promise<void> {
  const boundedSeconds = Math.max(-6 * 60 * 60, Math.min(6 * 60 * 60, seconds))
  const boundedSkips = Math.max(-1, Math.min(1, Math.round(skips)))
  const job = statsChain.then(async () => {
    const stored = await chrome.storage.local.get(STATS_KEY)
    const next = adjustStats(resolveStats(stored[STATS_KEY]), boundedSeconds, boundedSkips)
    await chrome.storage.local.set({ [STATS_KEY]: next })
  })
  statsChain = job.catch(() => undefined)
  return job
}

function dispatch(message: unknown): Promise<unknown> | null {
  if (!isRecord(message) || typeof message.type !== "string") return null
  const typed = message as Partial<BackgroundMessage>
  if (typed.type === "fetch-segments") {
    const videoId = typeof typed.videoId === "string" ? typed.videoId : ""
    if (!VIDEO_ID.test(videoId)) return Promise.resolve({ ok: false, error: "That video id is not usable." })
    return loadSegments(videoId)
      .then((segments) => ({ ok: true as const, segments }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : "SponsorBlock didn't respond."
        void recordDebug("background", `SponsorBlock error for ${videoId}: ${message}`)
        return {
          ok: false as const,
          error: message,
        }
      })
  }
  if (typed.type === "adjust-stats") {
    const seconds = typeof typed.seconds === "number" ? typed.seconds : 0
    const skips = typeof typed.skips === "number" ? typed.skips : 0
    return adjust(seconds, skips).then(() => ({ ok: true as const }))
  }
  return null
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const result = dispatch(message)
  if (!result) return undefined
  void result.then(sendResponse).catch((error: unknown) => {
    const text = error instanceof Error ? error.message : "Request failed"
    sendResponse({ ok: false, error: text })
  })
  return true
})

chrome.commands.onCommand.addListener((command) => {
  if (command !== "skip-segment") return
  void chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    const tabId = tabs[0]?.id
    if (tabId == null) return
    void chrome.tabs.sendMessage(tabId, { type: "skip-current" }).catch(() => undefined)
  })
})

chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.get([SETTINGS_KEY, STATS_KEY]).then((stored) => {
    const patch: Record<string, unknown> = {}
    if (stored[SETTINGS_KEY] == null) patch[SETTINGS_KEY] = resolveSettings(undefined)
    if (stored[STATS_KEY] == null) patch[STATS_KEY] = resolveStats(undefined)
    if (Object.keys(patch).length > 0) void chrome.storage.local.set(patch)
  })
})
