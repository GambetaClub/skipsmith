import { describe, expect, it } from "vitest"
import { liveFromSignals, playbackDuration } from "../src/lib/live"

describe("live detection", () => {
  it("does not treat a missing or infinite duration as live", () => {
    expect(liveFromSignals({ playerLiveClass: false, badgeDisplay: "none", badgeDisabled: false })).toBe(false)
    expect(liveFromSignals({ playerLiveClass: false, badgeDisplay: null, badgeDisabled: false })).toBe(false)
  })

  it("treats the player live class, or a visible enabled badge, as live", () => {
    expect(liveFromSignals({ playerLiveClass: true, badgeDisplay: "none", badgeDisabled: true })).toBe(true)
    expect(liveFromSignals({ playerLiveClass: false, badgeDisplay: "inline-block", badgeDisabled: false })).toBe(true)
    expect(liveFromSignals({ playerLiveClass: false, badgeDisplay: "inline-block", badgeDisabled: true })).toBe(false)
  })
})

describe("playback duration", () => {
  it("prefers the media element and falls back to SponsorBlock's length", () => {
    expect(playbackDuration(2327.081, [100])).toBe(2327.081)
    expect(playbackDuration(Number.NaN, [2327.081])).toBe(2327.081)
    expect(playbackDuration(Number.POSITIVE_INFINITY, [2327.081, 0])).toBe(2327.081)
    expect(playbackDuration(Number.NaN, [])).toBe(0)
  })
})
