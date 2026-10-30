import { describe, expect, it } from "vitest"
import type { CategoryMode } from "../src/lib/categories"
import { evaluate, holdSegments, manualSkipTarget, type Flags } from "../src/lib/segment-logic"
import type { Segment } from "../src/lib/segment"

function segment(uuid: string, category: string, start: number, end: number, actionType = "skip"): Segment {
  return { uuid, category, actionType, start, end }
}

interface Step {
  time: number
  userSeek?: boolean
  playing?: boolean
  initial?: boolean
  programmatic?: boolean
  duration?: number
}

function run(segments: Segment[], modes: Record<string, CategoryMode>, steps: Step[], duration = 1000) {
  let flags: Record<string, Flags> = {}
  let previous = 0
  const skips: Array<{ at: number; to: number; uuids: string[] }> = []
  const buttons: Array<string | null> = []
  const muted: string[][] = []
  for (const step of steps) {
    const decision = evaluate({
      previousTime: previous,
      currentTime: step.time,
      playbackRate: 1,
      duration: step.duration ?? duration,
      playing: step.playing ?? true,
      initial: step.initial ?? false,
      userSeek: step.userSeek ?? false,
      programmatic: step.programmatic ?? false,
      segments,
      modes,
      flags,
    })
    flags = decision.flags
    buttons.push(decision.button?.category ?? null)
    muted.push(decision.muteUuids)
    if (decision.skipTo != null) {
      skips.push({ at: step.time, to: decision.skipTo, uuids: [...decision.skipUuids] })
      const landed = evaluate({
        previousTime: step.time,
        currentTime: decision.skipTo,
        playbackRate: 1,
        duration: step.duration ?? duration,
        playing: true,
        initial: false,
        userSeek: false,
        programmatic: true,
        segments,
        modes,
        flags,
      })
      flags = landed.flags
      previous = decision.skipTo
    } else {
      previous = step.time
    }
  }
  return { skips, flags, buttons, muted }
}

describe("when to skip", () => {
  const sponsor = segment("a", "sponsor", 10, 30)

  it("skips once playback enters an auto segment", () => {
    const { skips } = run([sponsor], { sponsor: "auto" }, [{ time: 9.4 }, { time: 10.3 }])
    expect(skips).toEqual([{ at: 10.3, to: 30, uuids: ["a"] }])
  })

  it("skips a video that opens already inside an auto segment", () => {
    const decision = evaluate({
      previousTime: 14,
      currentTime: 14,
      playbackRate: 1,
      duration: 200,
      playing: false,
      initial: true,
      userSeek: false,
      programmatic: false,
      segments: [sponsor],
      modes: { sponsor: "auto" },
      flags: {},
    })
    expect(decision.skipTo).toBe(30)
  })

  it("does not skip while paused, then skips on resume", () => {
    const { skips } = run(
      [sponsor],
      { sponsor: "auto" },
      [
        { time: 9, playing: true },
        { time: 10.4, playing: false },
        { time: 10.8, playing: true },
      ],
    )
    expect(skips.map((skip) => skip.at)).toEqual([10.8])
  })

  it("shows a button instead of skipping when the category asks for one", () => {
    const { skips, buttons } = run([segment("intro", "intro", 0, 12)], { intro: "button" }, [{ time: 1 }, { time: 3 }])
    expect(skips).toEqual([])
    expect(buttons.at(-1)).toBe("intro")
  })

  it("does nothing for off and seek-bar-only categories", () => {
    const segments = [segment("f", "filler", 5, 15), segment("p", "preview", 20, 28)]
    const off = run(segments, { filler: "off", preview: "off" }, [{ time: 8 }])
    const bar = run([segment("p", "preview", 20, 28)], { preview: "seekbar" }, [{ time: 22 }])
    expect(off.skips).toEqual([])
    expect(off.buttons.at(-1)).toBeNull()
    expect(bar.skips).toEqual([])
    expect(bar.buttons.at(-1)).toBeNull()
  })

  it("ignores a highlight even if someone stored auto", () => {
    const { skips } = run([segment("h", "poi_highlight", 10, 12, "poi")], { poi_highlight: "auto" }, [{ time: 10.2 }])
    expect(skips).toEqual([])
  })

  it("mutes a mute segment instead of seeking it", () => {
    const { skips, muted, buttons } = run(
      [segment("m", "music_offtopic", 10, 20, "mute")],
      { music_offtopic: "auto" },
      [{ time: 12 }],
    )
    expect(skips).toEqual([])
    expect(muted.at(-1)).toEqual(["m"])
    expect(buttons.at(-1)).toBe("music_offtopic")
  })
})

describe("overlapping segments", () => {
  it("jumps to the end of overlapping auto segments", () => {
    const { skips } = run(
      [segment("a", "sponsor", 10, 20), segment("b", "selfpromo", 18, 35)],
      { sponsor: "auto", selfpromo: "auto" },
      [{ time: 9 }, { time: 12 }],
    )
    expect(skips).toEqual([{ at: 12, to: 35, uuids: ["a", "b"] }])
  })

  it("does not pull in a later segment that does not touch the run", () => {
    const { skips } = run(
      [segment("a", "sponsor", 10, 20), segment("b", "sponsor", 50, 60)],
      { sponsor: "auto" },
      [{ time: 12 }],
    )
    expect(skips).toEqual([{ at: 12, to: 20, uuids: ["a"] }])
  })

  it("chains a segment that starts just after the previous one ends", () => {
    const { skips } = run(
      [segment("a", "sponsor", 10, 20), segment("b", "sponsor", 20.2, 28)],
      { sponsor: "auto" },
      [{ time: 12 }],
    )
    expect(skips[0]?.to).toBe(28)
    expect(skips[0]?.uuids).toEqual(["a", "b"])
  })

  it("leaves a gap larger than the chain window for the next visit", () => {
    const { skips } = run(
      [segment("a", "sponsor", 10, 20), segment("b", "sponsor", 20.8, 28)],
      { sponsor: "auto" },
      [{ time: 12 }],
    )
    expect(skips).toEqual([{ at: 12, to: 20, uuids: ["a"] }])
  })

  it("does not auto-skip a button category that overlaps the sponsor", () => {
    const { skips } = run(
      [segment("a", "sponsor", 10, 25), segment("b", "intro", 15, 40)],
      { sponsor: "auto", intro: "button" },
      [{ time: 12 }],
    )
    expect(skips).toEqual([{ at: 12, to: 25, uuids: ["a"] }])
  })

  it("clamps the landing to the video duration", () => {
    const { skips } = run([segment("a", "sponsor", 10, 80)], { sponsor: "auto" }, [{ time: 12, duration: 22 }], 22)
    expect(skips[0]?.to).toBe(22)
  })
})

describe("seeking", () => {
  const sponsor = segment("a", "sponsor", 10, 40)

  it("skips when a forward seek lands inside an auto segment", () => {
    const { skips } = run([sponsor], { sponsor: "auto" }, [
      { time: 1 },
      { time: 22, userSeek: true },
    ])
    expect(skips).toEqual([{ at: 22, to: 40, uuids: ["a"] }])
  })

  it("does not loop when the viewer seeks back into a segment that was just skipped", () => {
    const { skips } = run([sponsor], { sponsor: "auto" }, [
      { time: 9.5 },
      { time: 10.4 },
      { time: 16, userSeek: true },
      { time: 16.6 },
      { time: 18 },
      { time: 21 },
    ])
    expect(skips).toEqual([{ at: 10.4, to: 40, uuids: ["a"] }])
  })

  it("does not start skipping when a backward seek lands inside a segment that was never skipped", () => {
    const { skips } = run([sponsor], { sponsor: "auto" }, [
      { time: 2 },
      { time: 70, userSeek: true },
      { time: 18, userSeek: true },
      { time: 19 },
      { time: 24 },
    ])
    expect(skips).toEqual([])
  })

  it("can skip again after the playhead goes back before the segment", () => {
    const { skips } = run([segment("a", "sponsor", 10, 30)], { sponsor: "auto" }, [
      { time: 9 },
      { time: 10.2 },
      { time: 14, userSeek: true },
      { time: 4, userSeek: true },
      { time: 10.4 },
    ])
    expect(skips.map((skip) => skip.to)).toEqual([30, 30])
  })

  it("does not treat our own seek as a new skip", () => {
    const decision = evaluate({
      previousTime: 10,
      currentTime: 18,
      playbackRate: 1,
      duration: 100,
      playing: true,
      initial: false,
      userSeek: false,
      programmatic: true,
      segments: [sponsor],
      modes: { sponsor: "auto" },
      flags: {},
    })
    expect(decision.skipTo).toBeNull()
  })

  it("holds a segment after unskip so playback inside it does not skip again", () => {
    const flags = holdSegments({}, ["a"])
    const decision = evaluate({
      previousTime: 12,
      currentTime: 12.4,
      playbackRate: 1,
      duration: 100,
      playing: true,
      initial: false,
      userSeek: false,
      programmatic: false,
      segments: [sponsor],
      modes: { sponsor: "auto" },
      flags,
    })
    expect(decision.skipTo).toBeNull()
    expect(decision.button?.category).toBe("sponsor")
  })
})

describe("NBCM_ZoWZo8 sponsor", () => {
  const sponsor = segment(
    "0cc063f84e1a242e7956ed38bade2d3d2fb39adffbd73d0c34b29d5d2913a3b37",
    "sponsor",
    147.5,
    248.283,
  )
  const highlight = segment(
    "45068756d814c0bf7423f859b793fb7b81def2a9b53e6921d39fa07f1b6de0127",
    "poi_highlight",
    2035.578,
    2035.578,
    "poi",
  )
  const duration = 2327.081
  const modes = { sponsor: "auto" as const, poi_highlight: "seekbar" as const }

  it("skips the sponsor at 2:27 and leaves the highlight", () => {
    const { skips } = run([sponsor, highlight], modes, [{ time: 140 }, { time: 147.6 }], duration)
    expect(skips).toEqual([{ at: 147.6, to: 248.283, uuids: [sponsor.uuid] }])
  })

  it("plays a seek back into the sponsor until the playhead is before its start", () => {
    const { skips } = run(
      [sponsor],
      { sponsor: "auto" },
      [
        { time: 140 },
        { time: 147.6 },
        { time: 180, userSeek: true },
        { time: 184 },
        { time: 190 },
        { time: 140, userSeek: true },
        { time: 147.8 },
      ],
      duration,
    )
    expect(skips.map((skip) => skip.at)).toEqual([147.6, 147.8])
  })

  it("plays a backward jump that arrives without a seek flag", () => {
    const { skips } = run([sponsor], { sponsor: "auto" }, [{ time: 260 }, { time: 180 }, { time: 186 }], duration)
    expect(skips).toEqual([])
  })

  it("stays in the sponsor after unskip until playback moves before the start", () => {
    const flags = holdSegments({}, [sponsor.uuid])
    const decision = evaluate({
      previousTime: 160,
      currentTime: 163,
      playbackRate: 1,
      duration,
      playing: true,
      initial: false,
      userSeek: false,
      programmatic: false,
      segments: [sponsor],
      modes: { sponsor: "auto" },
      flags,
    })
    expect(decision.skipTo).toBeNull()
    expect(decision.button?.category).toBe("sponsor")
  })
})

describe("manual skip", () => {
  it("skips the segment under the playhead even when it is seek-bar only", () => {
    const target = manualSkipTarget(12, [segment("a", "preview", 10, 20)], { preview: "seekbar" }, 100)
    expect(target?.end).toBe(20)
    expect(target?.uuids).toEqual(["a"])
  })

  it("does not skip a category that is off, or empty air", () => {
    expect(manualSkipTarget(12, [segment("a", "filler", 10, 20)], { filler: "off" }, 100)).toBeNull()
    expect(manualSkipTarget(3, [segment("a", "sponsor", 10, 20)], { sponsor: "auto" }, 100)).toBeNull()
  })

  it("includes an overlapping auto segment when the button segment is skipped by hand", () => {
    const target = manualSkipTarget(
      12,
      [segment("a", "intro", 10, 18), segment("b", "sponsor", 16, 30)],
      { intro: "button", sponsor: "auto" },
      100,
    )
    expect(target?.end).toBe(30)
    expect(target?.uuids).toEqual(["a", "b"])
  })
})
