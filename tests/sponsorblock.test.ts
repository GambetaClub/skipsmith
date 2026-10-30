import { describe, expect, it } from "vitest"
import { hashPrefix, sha256Hex } from "../src/lib/hash"
import { fetchSponsorSegments, parseSegments, segmentsPath, selectSegments } from "../src/lib/sponsorblock"

describe("hash prefix", () => {
  it("uses the first four hex characters of sha256", async () => {
    expect(await sha256Hex("hello")).toBe("2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824")
    expect(await hashPrefix("hello")).toBe("2cf2")
    expect(await hashPrefix("dQw4w9WgXcQ")).toBe("5f6b")
  })
})

describe("SponsorBlock responses", () => {
  it("builds a prefix url that does not contain the video id", () => {
    const path = segmentsPath("5f6b", ["sponsor", "intro"])
    expect(path.startsWith("/api/skipSegments/5f6b?")).toBe(true)
    expect(path).not.toContain("dQw4w9WgXcQ")
    expect(decodeURIComponent(path)).toContain('"sponsor"')
    expect(decodeURIComponent(path)).toContain('"mute"')
  })

  it("keeps only the watched video from a prefix bucket", async () => {
    const videoId = "dQw4w9WgXcQ"
    const full = await sha256Hex(videoId)
    const segments = selectSegments(
      [
        {
          videoID: "someone-else",
          hash: "abc",
          segments: [{ category: "sponsor", actionType: "skip", segment: [1, 2], UUID: "no" }],
        },
        {
          videoID: videoId,
          hash: full.toUpperCase(),
          segments: [
            { category: "sponsor", actionType: "skip", segment: [4, 9], UUID: "yes" },
            { category: "intro", actionType: "skip", segment: [1, 2], UUID: "earlier" },
          ],
        },
      ],
      videoId,
      full,
    )
    expect(segments.map((segment) => segment.uuid)).toEqual(["earlier", "yes"])
  })

  it("rejects an entry whose published hash does not match", async () => {
    const segments = selectSegments(
      [{ videoID: "dQw4w9WgXcQ", hash: "deadbeef", segments: [{ category: "sponsor", actionType: "skip", segment: [1, 4], UUID: "x" }] }],
      "dQw4w9WgXcQ",
      await sha256Hex("dQw4w9WgXcQ"),
    )
    expect(segments).toEqual([])
  })

  it("drops broken segments and zero-length skips, and keeps a highlight point", () => {
    const segments = parseSegments([
      { category: "sponsor", segment: [5, 5], UUID: "flat" },
      { category: "sponsor", segment: [8], UUID: "short" },
      null,
      { category: "poi_highlight", actionType: "poi", segment: [12, 12], UUID: "point" },
      { category: "intro", actionType: "skip", segment: [0, 3], UUID: "intro" },
    ])
    expect(segments.map((segment) => segment.uuid)).toEqual(["intro", "point"])
  })

  it("does not put the video id on the wire", async () => {
    const videoId = "abcdefghijk"
    const calls: string[] = []
    const segments = await fetchSponsorSegments(videoId, async (input) => {
      const url = String(input)
      calls.push(url)
      return new Response(
        JSON.stringify([
          { videoID: "other", segments: [{ category: "sponsor", actionType: "skip", segment: [1, 2], UUID: "no" }] },
          { videoID: videoId, segments: [{ category: "sponsor", actionType: "skip", segment: [3, 7], UUID: "yes" }] },
        ]),
        { status: 200 },
      )
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).not.toContain(videoId)
    expect(calls[0]).toContain(`/api/skipSegments/${await hashPrefix(videoId)}`)
    expect(segments.map((segment) => segment.uuid)).toEqual(["yes"])
  })

  it("treats 404 as no segments and does not try the mirror", async () => {
    let calls = 0
    const segments = await fetchSponsorSegments("abcdefghijk", async () => {
      calls += 1
      return new Response("not found", { status: 404 })
    })
    expect(segments).toEqual([])
    expect(calls).toBe(1)
  })

  it("falls through to the mirror after a server error", async () => {
    const seen: string[] = []
    const segments = await fetchSponsorSegments("abcdefghijk", async (input) => {
      const url = String(input)
      seen.push(url)
      if (seen.length === 1) return new Response("busy", { status: 503 })
      return new Response(JSON.stringify([]), { status: 200 })
    })
    expect(segments).toEqual([])
    expect(seen[0]).toContain("https://sponsor.ajay.app/")
    expect(seen[1]).toContain("https://api.sponsor.ajay.app/")
  })
})
