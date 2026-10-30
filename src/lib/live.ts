export interface LiveSignals {
  playerLiveClass: boolean
  badgeDisplay: string | null
  badgeDisabled: boolean
}

/**
 * The desktop player keeps a Live badge in the DOM for every video. On the
 * current Delhi UI that badge is not marked disabled for a normal upload;
 * it stays `display: none` unless the player has the `ytp-live` class.
 * Media Source playback also reports `NaN` or `Infinity` for `video.duration`
 * until (and sometimes after) the duration is committed. That is not a live stream.
 */
export function liveFromSignals(signals: LiveSignals): boolean {
  if (signals.playerLiveClass) return true
  if (!signals.badgeDisplay || signals.badgeDisplay === "none") return false
  if (signals.badgeDisabled) return false
  return true
}

/** Prefer the media element. Fall back to a duration SponsorBlock published with the segments. */
export function playbackDuration(mediaDuration: number, hinted: readonly number[]): number {
  if (Number.isFinite(mediaDuration) && mediaDuration > 1) return mediaDuration
  let best = 0
  for (const value of hinted) {
    if (Number.isFinite(value) && value > best) best = value
  }
  return best
}
