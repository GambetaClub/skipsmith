import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, expect, test, type BrowserContext, type Page } from "@playwright/test"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dist = path.join(root, "dist")
const carrier = path.join(root, "e2e/fixtures/carrier.mp4")
const watch = "https://www.youtube.com/watch?v=NBCM_ZoWZo8"
const shots = path.join(tmpdir(), "skipsmith-shots")

interface Segment {
  category: string
  start: number
  end: number
  actionType: string
}

interface VideoState {
  videoId?: string
  segments?: Segment[]
  error?: string | null
}

async function videoState(context: BrowserContext): Promise<VideoState | null> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker", { timeout: 15_000 }))
  return worker.evaluate(async () => {
    const tabs = await chrome.tabs.query({})
    for (const tab of tabs) {
      if (tab.id == null) continue
      try {
        const state: unknown = await chrome.tabs.sendMessage(tab.id, { type: "get-video-state" })
        if (
          typeof state === "object" &&
          state !== null &&
          "videoId" in state &&
          state.videoId === "NBCM_ZoWZo8"
        ) {
          return state as VideoState
        }
      } catch {
        // Tabs without the content script do not answer.
      }
    }
    return null
  })
}

function sponsorKey(state: VideoState | null): string {
  const sponsor = state?.segments?.find((segment) => segment.category === "sponsor")
  if (!sponsor) return state?.error ?? ""
  const start = Math.abs(sponsor.start - 147.5) < 0.001
  const end = Math.abs(sponsor.end - 248.283) < 0.001
  return start && end && sponsor.actionType === "skip" ? "sponsor" : `${sponsor.start}:${sponsor.end}`
}

async function revealPlayer(page: Page): Promise<void> {
  await page.evaluate(() => {
    let node: HTMLElement | null = document.querySelector("#movie_player")
    while (node) {
      if (getComputedStyle(node).visibility === "hidden") node.style.setProperty("visibility", "visible", "important")
      node = node.parentElement
    }
    const player = document.querySelector("#movie_player")
    player?.classList.remove("ytp-hide-controls", "ytp-autohide")
    for (const el of document.querySelectorAll(
      "yt-interstitial-view-model, .interstitialViewModelHost, .playerInterstitialRendererScrim",
    )) {
      if (el instanceof HTMLElement && !player?.contains(el) && !el.contains(player)) {
        el.style.setProperty("display", "none", "important")
      }
    }
    const bar = document.querySelector(".ytp-progress-bar")
    if (bar instanceof HTMLElement && player) {
      for (let pass = 0; pass < 5; pass += 1) {
        const box = bar.getBoundingClientRect()
        const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
        if (!target || target.closest("#movie_player")) break
        if (!(target instanceof HTMLElement) || target.contains(player) || player.contains(target)) break
        target.style.setProperty("display", "none", "important")
      }
    }
    for (const selector of [".ytp-chrome-bottom", ".ytp-progress-bar-container", ".ytp-progress-bar", ".skipsmith-toast"]) {
      const el = document.querySelector(selector)
      if (el instanceof HTMLElement) {
        el.style.setProperty("opacity", "1", "important")
        el.style.setProperty("visibility", "visible", "important")
      }
    }
  })
}

/** Drag the YouTube progress bar to `seconds`. The bot wall ignores that gesture, so the same seek is applied on the media element when the bar does not move. */
async function seekOnTimeline(page: Page, seconds: number): Promise<void> {
  await page.evaluate(async (target) => {
    const video = document.querySelector("#movie_player video")
    const bar = document.querySelector(".ytp-progress-bar")
    if (!(video instanceof HTMLVideoElement) || !(bar instanceof HTMLElement)) throw new Error("missing timeline")
    video.playbackRate = 1
    const rect = bar.getBoundingClientRect()
    const ratio = Math.min(0.98, Math.max(0.02, target / video.duration))
    const x = rect.left + rect.width * ratio
    const y = rect.top + Math.max(1, rect.height / 2)
    const point = (type: string, clientX: number): void => {
      bar.dispatchEvent(
        new PointerEvent(type, { bubbles: true, cancelable: true, clientX, clientY: y, pointerId: 1, button: 0, pointerType: "mouse" }),
      )
    }
    point("pointerdown", x - 30)
    point("pointermove", x)
    point("pointerup", x)
    bar.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }))
    await new Promise((resolve) => window.setTimeout(resolve, 250))
    if (Math.abs(video.currentTime - target) > 8) video.currentTime = target
  }, seconds)
}

async function currentTime(page: Page): Promise<number> {
  return page.evaluate(() => {
    const video = document.querySelector("#movie_player video")
    return video instanceof HTMLVideoElement ? video.currentTime : 0
  })
}

test("skips the real sponsor on NBCM_ZoWZo8 and lets a seek back play it", async () => {
  test.setTimeout(90_000)
  const userDataDir = await mkdtemp(path.join(tmpdir(), "skipsmith-watch-"))
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    ignoreDefaultArgs: ["--disable-extensions"],
    args: [
      `--disable-extensions-except=${dist}`,
      `--load-extension=${dist}`,
      "--no-first-run",
      "--disable-default-apps",
      "--autoplay-policy=no-user-gesture-required",
      "--mute-audio",
    ],
  })

  await rm(shots, { recursive: true, force: true })
  await mkdir(shots, { recursive: true })

  try {
    const page = await context.newPage()
    await page.goto(watch, { waitUntil: "domcontentloaded", timeout: 45_000 })
    await expect.poll(async () => (await videoState(context))?.videoId ?? "", { timeout: 25_000 }).toBe("NBCM_ZoWZo8")
    await expect.poll(async () => sponsorKey(await videoState(context)), { timeout: 20_000 }).toBe("sponsor")

    const media = (await readFile(carrier)).toString("base64")
    await page.evaluate(async (b64) => {
      const binary = atob(b64)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      const video = document.querySelector("#movie_player video")
      if (!(video instanceof HTMLVideoElement)) throw new Error("missing video")
      video.src = URL.createObjectURL(new Blob([bytes], { type: "video/mp4" }))
      video.muted = true
      await video.play()
      video.playbackRate = 1
      video.currentTime = 120
      video.pause()
    }, media)

    const marker = page.locator(".skipsmith-marker:not(.skipsmith-marker-point)").first()
    await expect(marker).toBeAttached({ timeout: 10_000 })
    await revealPlayer(page)
    const markerBox = await marker.boundingBox()
    expect(markerBox?.width ?? 0).toBeGreaterThan(40)
    const hit = await page.evaluate(() => {
      const range = document.querySelector(".skipsmith-marker:not(.skipsmith-marker-point)")
      if (!(range instanceof HTMLElement)) return "missing"
      const box = range.getBoundingClientRect()
      const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      const name = target ? `${target.tagName}.${String((target as HTMLElement).className).slice(0, 80)}` : "none"
      if (target?.closest(".skipsmith-marker")) return `blocked:${name}`
      if (target?.closest("yt-interstitial-view-model, .interstitialViewModelHost")) return `covered:${name}`
      if (!target?.closest("#movie_player")) return `outside:${name}`
      return "open"
    })
    await page.screenshot({ path: path.join(shots, "markers-before-sponsor.png") })
    expect(hit).toBe("open")

    await page.evaluate(() => {
      const video = document.querySelector("#movie_player video")
      if (!(video instanceof HTMLVideoElement)) throw new Error("missing video")
      video.playbackRate = 8
      void video.play()
    })
    await expect.poll(() => currentTime(page), { timeout: 20_000 }).toBeGreaterThan(247)
    await revealPlayer(page)
    await expect(page.locator(".skipsmith-toast-text")).toHaveText("Skipped sponsor")
    await page.locator("#movie_player").screenshot({ path: path.join(shots, "sponsor-skipped.png") })

    await seekOnTimeline(page, 180)
    await page.waitForTimeout(1500)
    const inside = await currentTime(page)
    expect(inside).toBeGreaterThan(180)
    expect(inside).toBeLessThan(210)
    await revealPlayer(page)
    await page.locator("#movie_player").screenshot({ path: path.join(shots, "seek-back-plays.png") })

    await revealPlayer(page)
    await page.locator(".skipsmith-unskip").click({ timeout: 8_000 })
    await expect.poll(() => currentTime(page), { timeout: 5_000 }).toBeLessThan(170)
    await page.waitForTimeout(1500)
    const afterUnskip = await currentTime(page)
    expect(afterUnskip).toBeGreaterThan(140)
    expect(afterUnskip).toBeLessThan(200)
    await revealPlayer(page)
    await page.locator("#movie_player").screenshot({ path: path.join(shots, "unskip-plays.png") })
  } finally {
    await context.close()
    await rm(userDataDir, { recursive: true, force: true })
  }
})
