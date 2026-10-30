import { describe, expect, it } from "vitest"
import {
  POPUP_NO_SEGMENTS,
  POPUP_PLAYER_MISSING,
  POPUP_SCRIPT_MISSING,
  popupCopy,
} from "../src/lib/popup-notice"
import { emptyVideoState, type VideoState } from "../src/lib/segment"

const watch = "https://www.youtube.com/watch?v=NBCM_ZoWZo8"

function state(patch: Partial<VideoState>): VideoState {
  return { ...emptyVideoState(), onVideo: true, attached: true, videoId: "NBCM_ZoWZo8", ...patch }
}

describe("popup notice", () => {
  it("says when the content script is not running on a YouTube video", () => {
    const copy = popupCopy({ tabUrl: watch, reachable: false, state: emptyVideoState(), enabled: true })
    expect(copy.status).toBe(POPUP_SCRIPT_MISSING)
    expect(copy.tone).toBe("warn")
    expect(copy.showSegments).toBe(false)
  })

  it("says when SponsorBlock returned an error", () => {
    const copy = popupCopy({
      tabUrl: watch,
      reachable: true,
      state: state({ error: "Failed to fetch", segments: [] }),
      enabled: true,
    })
    expect(copy.status).toBe("SponsorBlock error: Failed to fetch")
    expect(copy.tone).toBe("error")
  })

  it("keeps a SponsorBlock message that is already specific", () => {
    const copy = popupCopy({
      tabUrl: watch,
      reachable: true,
      state: state({ error: "SponsorBlock returned 503" }),
      enabled: true,
    })
    expect(copy.status).toBe("SponsorBlock returned 503")
  })

  it("says when the video has no segments", () => {
    const copy = popupCopy({
      tabUrl: watch,
      reachable: true,
      state: state({ segments: [], error: null, loading: false }),
      enabled: true,
    })
    expect(copy.status).toBe(POPUP_NO_SEGMENTS)
    expect(copy.tone).toBe("empty")
  })

  it("says when the page is a video but the player is missing", () => {
    const copy = popupCopy({
      tabUrl: watch,
      reachable: true,
      state: state({ attached: false, segments: [] }),
      enabled: true,
    })
    expect(copy.status).toBe(POPUP_PLAYER_MISSING)
  })

  it("does not call an ordinary tab a missing content script", () => {
    const copy = popupCopy({
      tabUrl: "https://example.com/",
      reachable: false,
      state: emptyVideoState(),
      enabled: true,
    })
    expect(copy.title).toBe("No video open")
    expect(copy.status).not.toBe(POPUP_SCRIPT_MISSING)
  })
})
