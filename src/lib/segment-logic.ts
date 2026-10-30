import type { CategoryMode } from "./categories"
import type { Segment } from "./segment"

/**
 * Auto-skip latches a segment until the playhead moves back before its start.
 * That stops a skip from repeating when the player lands slightly early, or when
 * the viewer seeks backward into a segment they just left. Entering again from
 * before the start is allowed to skip.
 *
 * Samples caused by our own seek are `programmatic` and never start a new skip,
 * so the seek itself is not mistaken for the viewer scrubbing.
 */

export const CLUSTER_GAP_SECONDS = 0.35
export const MIN_SKIP_SECONDS = 0.2

export interface Flags {
  latched: boolean
}

export interface EvaluateInput {
  previousTime: number
  currentTime: number
  playbackRate: number
  duration: number
  playing: boolean
  initial: boolean
  userSeek: boolean
  programmatic: boolean
  segments: readonly Segment[]
  modes: Readonly<Record<string, CategoryMode>>
  flags: Readonly<Record<string, Flags>>
}

export interface SkipButton {
  uuid: string
  category: string
  to: number
  uuids: string[]
  categories: string[]
}

export interface Decision {
  skipTo: number | null
  skipUuids: string[]
  skipCategories: string[]
  muteUuids: string[]
  button: SkipButton | null
  flags: Record<string, Flags>
}

interface Cluster {
  end: number
  uuids: string[]
  categories: string[]
}

function modeOf(modes: Readonly<Record<string, CategoryMode>>, category: string): CategoryMode {
  const mode = modes[category]
  if (mode === "auto" || mode === "button" || mode === "seekbar" || mode === "off") return mode
  return "off"
}

function actionOf(segment: Segment): string {
  return segment.actionType || "skip"
}

function usable(segment: Segment, duration: number): boolean {
  if (!segment.uuid) return false
  if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)) return false
  if (segment.end <= segment.start) return false
  if (segment.start < 0) return false
  if (duration > 0 && segment.start >= duration) return false
  return true
}

function inside(segment: Segment, time: number): boolean {
  return time >= segment.start && time < segment.end
}

function isSkippableAction(action: string): boolean {
  return action === "skip" || action === "full" || action === "mute"
}

function cloneFlags(flags: Readonly<Record<string, Flags>>): Record<string, Flags> {
  const next: Record<string, Flags> = {}
  for (const [id, flag] of Object.entries(flags)) next[id] = { latched: flag.latched }
  return next
}

function expandCluster(time: number, pool: readonly Segment[], duration: number): Cluster {
  const sorted = pool.filter((segment) => usable(segment, duration)).sort((a, b) => a.start - b.start || a.end - b.end)
  const used = new Set<string>()
  const categories: string[] = []
  let end = time

  for (let guard = 0; guard <= sorted.length + 1; guard += 1) {
    let grew = false
    for (const segment of sorted) {
      if (used.has(segment.uuid)) continue
      const containsNow = inside(segment, time)
      if (used.size === 0 && !containsNow) continue
      const closeEnough = segment.start <= end + CLUSTER_GAP_SECONDS
      const reaches = segment.end > end + 0.05 && segment.end > time + MIN_SKIP_SECONDS
      if (!closeEnough || !reaches) continue
      used.add(segment.uuid)
      if (!categories.includes(segment.category)) categories.push(segment.category)
      end = Math.max(end, segment.end)
      grew = true
    }
    if (!grew) break
  }

  if (duration > 0 && end > duration) end = duration
  return {
    end,
    uuids: sorted.filter((segment) => used.has(segment.uuid)).map((segment) => segment.uuid),
    categories,
  }
}

export function evaluate(input: EvaluateInput): Decision {
  const flags = cloneFlags(input.flags)
  const time = input.currentTime
  const duration = Number.isFinite(input.duration) && input.duration > 0 ? input.duration : 0
  const rate = Number.isFinite(input.playbackRate) && input.playbackRate > 0 ? input.playbackRate : 1
  const backwardThreshold = Math.max(0.4, 0.25 * rate)
  const backward =
    !input.programmatic && input.userSeek && input.previousTime - time >= backwardThreshold

  for (const segment of input.segments) {
    if (!usable(segment, duration)) continue
    if (time < segment.start - 0.05 && flags[segment.uuid]?.latched) {
      flags[segment.uuid] = { latched: false }
    }
  }

  if (backward) {
    for (const segment of input.segments) {
      if (!usable(segment, duration) || !inside(segment, time)) continue
      const mode = modeOf(input.modes, segment.category)
      if (mode === "auto" || mode === "button") flags[segment.uuid] = { latched: true }
    }
  }

  const forwardSeek = input.userSeek && time > input.previousTime + 0.05
  const canAuto =
    !input.programmatic && !backward && (input.playing || input.initial || forwardSeek)

  let skipTo: number | null = null
  let skipUuids: string[] = []
  let skipCategories: string[] = []

  if (canAuto) {
    const pool = input.segments.filter((segment) => {
      if (!usable(segment, duration) || flags[segment.uuid]?.latched) return false
      if (modeOf(input.modes, segment.category) !== "auto") return false
      const action = actionOf(segment)
      return action === "skip" || action === "full"
    })
    const hit = pool.some((segment) => inside(segment, time))
    if (hit) {
      const cluster = expandCluster(time, pool, duration)
      if (cluster.uuids.length > 0 && cluster.end > time + MIN_SKIP_SECONDS) {
        skipTo = cluster.end
        skipUuids = cluster.uuids
        skipCategories = cluster.categories
        for (const uuid of skipUuids) flags[uuid] = { latched: true }
      }
    }
  }

  const muteUuids =
    skipTo == null
      ? input.segments
          .filter((segment) => {
            if (!usable(segment, duration) || !inside(segment, time)) return false
            if (actionOf(segment) !== "mute") return false
            return modeOf(input.modes, segment.category) === "auto"
          })
          .map((segment) => segment.uuid)
      : []

  const button = skipTo == null ? pickButton(input.segments, time, input.modes, flags, duration) : null

  return { skipTo, skipUuids, skipCategories, muteUuids, button, flags }
}

function pickButton(
  segments: readonly Segment[],
  time: number,
  modes: Readonly<Record<string, CategoryMode>>,
  flags: Readonly<Record<string, Flags>>,
  duration: number,
): SkipButton | null {
  const hits = segments.filter((segment) => {
    if (!usable(segment, duration) || !inside(segment, time)) return false
    if (!isSkippableAction(actionOf(segment))) return false
    const mode = modeOf(modes, segment.category)
    if (mode === "button") return true
    if (mode === "auto" && actionOf(segment) === "mute") return true
    if (mode === "auto" && flags[segment.uuid]?.latched && actionOf(segment) !== "poi") return true
    return false
  })
  hits.sort((a, b) => a.start - b.start || b.end - a.end)
  const chosen = hits[0]
  if (!chosen) return null

  const pool = segments.filter((segment) => {
    if (!isSkippableAction(actionOf(segment))) return false
    const mode = modeOf(modes, segment.category)
    return mode === "auto" || mode === "button" || mode === "seekbar"
  })
  const cluster = expandCluster(time, pool, duration)
  if (cluster.uuids.length === 0 || cluster.end <= time + MIN_SKIP_SECONDS) return null
  return {
    uuid: chosen.uuid,
    category: chosen.category,
    to: cluster.end,
    uuids: cluster.uuids,
    categories: cluster.categories,
  }
}

export function manualSkipTarget(
  time: number,
  segments: readonly Segment[],
  modes: Readonly<Record<string, CategoryMode>>,
  duration: number,
): Cluster | null {
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const pool = segments.filter((segment) => {
    if (!isSkippableAction(actionOf(segment))) return false
    const mode = modeOf(modes, segment.category)
    return mode === "auto" || mode === "button" || mode === "seekbar"
  })
  if (!pool.some((segment) => usable(segment, safeDuration) && inside(segment, time))) return null
  const cluster = expandCluster(time, pool, safeDuration)
  if (cluster.uuids.length === 0 || cluster.end <= time + MIN_SKIP_SECONDS) return null
  return cluster
}

export function holdSegments(flags: Readonly<Record<string, Flags>>, uuids: readonly string[]): Record<string, Flags> {
  const next = cloneFlags(flags)
  for (const uuid of uuids) next[uuid] = { latched: true }
  return next
}
