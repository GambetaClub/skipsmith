import { describe, expect, it } from "vitest"
import { readCached, writeCached, CACHE_LIMIT } from "../src/lib/cache"
import { adjustStats, resolveSettings, resolveStats } from "../src/lib/settings"
import { rateFor, rememberRate, resolveSpeeds } from "../src/lib/speeds"
import { formatClock, formatRange, formatSaved } from "../src/lib/time"
import { videoIdFromUrl } from "../src/lib/youtube-url"
import type { Segment } from "../src/lib/segment"

describe("settings", () => {
  it("defaults sponsor categories to auto and filler to off", () => {
    const settings = resolveSettings(undefined)
    expect(settings.enabled).toBe(true)
    expect(settings.rememberSpeed).toBe(false)
    expect(settings.debug).toBe(false)
    expect(settings.modes.sponsor).toBe("auto")
    expect(settings.modes.selfpromo).toBe("auto")
    expect(settings.modes.interaction).toBe("auto")
    expect(settings.modes.intro).toBe("button")
    expect(settings.modes.filler).toBe("off")
    expect(settings.modes.poi_highlight).toBe("seekbar")
  })

  it("keeps stored modes and refuses to auto-skip a highlight", () => {
    const settings = resolveSettings({
      enabled: false,
      rememberSpeed: true,
      debug: true,
      excludedChannels: ["UC123", "UC123", 4, ""],
      modes: { sponsor: "button", intro: "off", poi_highlight: "auto", filler: "nope" },
    })
    expect(settings.enabled).toBe(false)
    expect(settings.rememberSpeed).toBe(true)
    expect(settings.debug).toBe(true)
    expect(settings.excludedChannels).toEqual(["UC123"])
    expect(settings.modes.sponsor).toBe("button")
    expect(settings.modes.intro).toBe("off")
    expect(settings.modes.poi_highlight).toBe("seekbar")
    expect(settings.modes.filler).toBe("off")
  })

  it("floors time saved at zero", () => {
    expect(adjustStats(resolveStats({ timeSavedSeconds: 5, skipCount: 2 }), -9, -1)).toEqual({
      timeSavedSeconds: 0,
      skipCount: 1,
    })
    expect(resolveStats(null)).toEqual({ timeSavedSeconds: 0, skipCount: 0 })
  })
})

describe("speed memory", () => {
  it("prefers the channel rate and ignores nonsense", () => {
    const speeds = rememberRate(resolveSpeeds({ global: 9, byChannel: { UC1: "fast" } }), "UC1", 1.5)
    expect(rateFor(speeds, "UC1")).toBe(1.5)
    expect(rateFor(speeds, "UC2")).toBe(1.5)
    expect(rememberRate(speeds, "UC2", 12)).toEqual(speeds)
  })
})

describe("segment cache", () => {
  const segment: Segment = { uuid: "a", category: "sponsor", actionType: "skip", start: 1, end: 2 }

  it("expires empty results sooner than hits, and drops the oldest entries", () => {
    expect(readCached({ v: { at: 0, segments: [] } }, "v", 10 * 60 * 1000 + 1)).toBeUndefined()
    expect(readCached({ v: { at: 0, segments: [segment] } }, "v", 10 * 60 * 1000 + 1)?.[0]?.uuid).toBe("a")

    let cache = {}
    for (let index = 0; index < CACHE_LIMIT + 2; index += 1) {
      cache = writeCached(cache, `v${index}`, [], index)
    }
    expect(cache).not.toHaveProperty("v0")
    expect(cache).toHaveProperty(`v${CACHE_LIMIT + 1}`)
    expect(Object.keys(cache)).toHaveLength(CACHE_LIMIT)
  })
})

describe("youtube urls", () => {
  it("reads watch, shorts, embeds, and live ids", () => {
    expect(videoIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12")).toBe("dQw4w9WgXcQ")
    expect(videoIdFromUrl("https://www.youtube.com/shorts/abcdefghijk")).toBe("abcdefghijk")
    expect(videoIdFromUrl("https://www.youtube.com/embed/abcdefghijk")).toBe("abcdefghijk")
    expect(videoIdFromUrl("https://www.youtube-nocookie.com/embed/abcdefghijk")).toBe("abcdefghijk")
    expect(videoIdFromUrl("https://youtu.be/abcdefghijk")).toBe("abcdefghijk")
    expect(videoIdFromUrl("https://www.youtube.com/feed/subscriptions")).toBeNull()
    expect(videoIdFromUrl("not a url")).toBeNull()
  })
})

describe("clock formatting", () => {
  it("formats ranges and saved time", () => {
    expect(formatClock(65)).toBe("1:05")
    expect(formatClock(3661)).toBe("1:01:01")
    expect(formatRange(12, 12.1)).toBe("0:12")
    expect(formatRange(12, 74)).toBe("0:12 – 1:14")
    expect(formatSaved(45)).toBe("45s")
    expect(formatSaved(125)).toBe("2m 5s")
    expect(formatSaved(3700)).toBe("1h 1m")
  })
})
