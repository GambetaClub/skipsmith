import { resolveSettings, SETTINGS_KEY } from "./settings"

export const DEBUG_LOG_KEY = "debugLog"
export const DEBUG_LOG_LIMIT = 80

export interface DebugEntry {
  at: number
  source: string
  message: string
}

function isEntry(value: unknown): value is DebugEntry {
  if (typeof value !== "object" || value === null) return false
  const entry = value as Partial<DebugEntry>
  return typeof entry.at === "number" && typeof entry.source === "string" && typeof entry.message === "string"
}

export function appendDebug(stored: unknown, entry: DebugEntry, limit = DEBUG_LOG_LIMIT): DebugEntry[] {
  const current = Array.isArray(stored) ? stored.filter(isEntry) : []
  return [...current, entry].slice(-limit)
}

export function formatDebug(entries: readonly DebugEntry[]): string {
  return entries
    .map((entry) => {
      const clock = new Date(entry.at).toISOString().slice(11, 19)
      return `${clock}  ${entry.source}  ${entry.message}`
    })
    .join("\n")
}

export async function recordDebug(source: string, message: string): Promise<void> {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, DEBUG_LOG_KEY])
  if (!resolveSettings(stored[SETTINGS_KEY]).debug) return
  const next = appendDebug(stored[DEBUG_LOG_KEY], { at: Date.now(), source, message })
  await chrome.storage.local.set({ [DEBUG_LOG_KEY]: next })
}
