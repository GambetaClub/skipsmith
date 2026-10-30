import { type CategoryMode, defaultModes, isCategoryMode } from "./categories"

export interface Settings {
  enabled: boolean
  modes: Record<string, CategoryMode>
  excludedChannels: string[]
  rememberSpeed: boolean
  debug: boolean
}

export interface Stats {
  timeSavedSeconds: number
  skipCount: number
}

export const SETTINGS_KEY = "settings"
export const STATS_KEY = "stats"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function defaultSettings(): Settings {
  return {
    enabled: true,
    modes: defaultModes(),
    excludedChannels: [],
    rememberSpeed: false,
    debug: false,
  }
}

export function resolveSettings(stored: unknown): Settings {
  const defaults = defaultSettings()
  if (!isRecord(stored)) return defaults

  const modes = { ...defaults.modes }
  if (isRecord(stored.modes)) {
    for (const category of Object.keys(defaults.modes)) {
      const value = stored.modes[category]
      if (!isCategoryMode(value)) continue
      if (category === "poi_highlight" && (value === "auto" || value === "button")) {
        modes[category] = "seekbar"
        continue
      }
      modes[category] = value
    }
  }

  const excluded = Array.isArray(stored.excludedChannels)
    ? stored.excludedChannels.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 200)
    : []

  return {
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : defaults.enabled,
    modes,
    excludedChannels: [...new Set(excluded)],
    rememberSpeed: typeof stored.rememberSpeed === "boolean" ? stored.rememberSpeed : false,
    debug: stored.debug === true,
  }
}

export function emptyStats(): Stats {
  return { timeSavedSeconds: 0, skipCount: 0 }
}

export function resolveStats(stored: unknown): Stats {
  if (!isRecord(stored)) return emptyStats()
  const time = Number(stored.timeSavedSeconds)
  const skips = Number(stored.skipCount)
  return {
    timeSavedSeconds: Number.isFinite(time) && time > 0 ? time : 0,
    skipCount: Number.isFinite(skips) && skips > 0 ? Math.floor(skips) : 0,
  }
}

export function adjustStats(stats: Stats, seconds: number, skips: number): Stats {
  const safeSeconds = Number.isFinite(seconds) ? seconds : 0
  const safeSkips = Number.isFinite(skips) ? skips : 0
  return {
    timeSavedSeconds: Math.max(0, stats.timeSavedSeconds + safeSeconds),
    skipCount: Math.max(0, Math.round(stats.skipCount + safeSkips)),
  }
}
