import { describe, expect, it } from "vitest"
import { appendDebug, formatDebug } from "../src/lib/debug-log"

describe("debug log", () => {
  it("keeps the newest entries and ignores junk", () => {
    const first = appendDebug(null, { at: 1, source: "player", message: "one" }, 2)
    const next = appendDebug([...first, { nope: true }], { at: 2, source: "background", message: "two" }, 2)
    const third = appendDebug(next, { at: 3, source: "player", message: "three" }, 2)
    expect(third.map((entry) => entry.message)).toEqual(["two", "three"])
    expect(formatDebug(third)).toContain("player  three")
  })
})
