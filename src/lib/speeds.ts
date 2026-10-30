export interface SpeedMemory {
  global: number | null
  byChannel: Record<string, number>
}

export const SPEEDS_KEY = "speeds"

const MIN_RATE = 0.25
const MAX_RATE = 4

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function cleanRate(value: unknown): number | null {
  const rate = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(rate) || rate < MIN_RATE || rate > MAX_RATE) return null
  return Math.round(rate * 100) / 100
}

export function emptySpeeds(): SpeedMemory {
  return { global: null, byChannel: {} }
}

export function resolveSpeeds(stored: unknown): SpeedMemory {
  if (!isRecord(stored)) return emptySpeeds()
  const byChannel: Record<string, number> = {}
  if (isRecord(stored.byChannel)) {
    for (const [channelId, value] of Object.entries(stored.byChannel)) {
      if (!channelId || channelId.length > 200) continue
      const rate = cleanRate(value)
      if (rate != null) byChannel[channelId] = rate
    }
  }
  return { global: cleanRate(stored.global), byChannel }
}

export function rateFor(speeds: SpeedMemory, channelId: string | null): number | null {
  if (channelId && typeof speeds.byChannel[channelId] === "number") return speeds.byChannel[channelId]
  return speeds.global
}

export function rememberRate(speeds: SpeedMemory, channelId: string | null, rate: number): SpeedMemory {
  const cleaned = cleanRate(rate)
  if (cleaned == null) return speeds
  const byChannel = { ...speeds.byChannel }
  if (channelId) byChannel[channelId] = cleaned
  return { global: cleaned, byChannel }
}
