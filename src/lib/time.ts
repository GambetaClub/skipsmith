export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.floor(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
  }
  return `${minutes}:${String(secs).padStart(2, "0")}`
}

export function formatRange(start: number, end: number): string {
  if (!Number.isFinite(start) || !Number.isFinite(end)) return ""
  if (Math.abs(end - start) < 0.25) return formatClock(start)
  return `${formatClock(start)} – ${formatClock(end)}`
}

export function formatSaved(seconds: number): string {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return secs ? `${minutes}m ${secs}s` : `${minutes}m`
  return `${secs}s`
}
