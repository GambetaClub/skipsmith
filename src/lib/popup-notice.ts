import type { VideoState } from "./segment"
import { videoIdFromUrl } from "./youtube-url"

export const POPUP_NO_VIDEO = "Open a YouTube video. Segments for it will show up here."
export const POPUP_SCRIPT_MISSING = "Content script isn't running. Reload this tab."
export const POPUP_PLAYER_MISSING = "Skipsmith can't see the YouTube player on this tab yet."
export const POPUP_NO_SEGMENTS = "No segments submitted for this video."
export const POPUP_LOADING = "Asking SponsorBlock…"
export const POPUP_DISABLED = "Skipping is off. The list below is still filled in."
export const POPUP_EXCLUDED = "This channel is excluded. Nothing here will be skipped."

export type PopupTone = "idle" | "error" | "empty" | "warn"

export interface PopupCopy {
  title: string
  status: string
  tone: PopupTone
  showSegments: boolean
}

export function apiStatus(error: string): string {
  if (error.toLowerCase().includes("sponsorblock")) return error
  return `SponsorBlock error: ${error}`
}

export function popupCopy(input: {
  tabUrl: string | null
  reachable: boolean
  state: VideoState
  enabled: boolean
}): PopupCopy {
  const youtube = input.tabUrl != null && videoIdFromUrl(input.tabUrl) != null
  if (!input.reachable) {
    if (youtube) return { title: "This tab", status: POPUP_SCRIPT_MISSING, tone: "warn", showSegments: false }
    return { title: "No video open", status: POPUP_NO_VIDEO, tone: "idle", showSegments: false }
  }

  const state = input.state
  if (!state.onVideo) return { title: "No video open", status: POPUP_NO_VIDEO, tone: "idle", showSegments: false }
  if (!state.attached) {
    return { title: state.title || "This video", status: POPUP_PLAYER_MISSING, tone: "warn", showSegments: false }
  }

  const title = state.title || "This video"
  if (!input.enabled) return { title, status: POPUP_DISABLED, tone: "idle", showSegments: true }
  if (state.excluded) return { title, status: POPUP_EXCLUDED, tone: "idle", showSegments: true }
  if (state.loading) return { title, status: POPUP_LOADING, tone: "idle", showSegments: true }
  if (state.error) return { title, status: apiStatus(state.error), tone: "error", showSegments: false }
  if (state.segments.length === 0) return { title, status: POPUP_NO_SEGMENTS, tone: "empty", showSegments: false }
  return { title, status: "", tone: "idle", showSegments: true }
}
