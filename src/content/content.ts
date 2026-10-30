import { WatchSession } from "./session"
import { emptyVideoState, type VideoState } from "../lib/segment"
import { videoIdFromUrl } from "../lib/youtube-url"
import { videoForPage } from "./page"

let videoId: string | null = null
let video: HTMLVideoElement | null = null
let session: WatchSession | null = null

function currentState(): VideoState {
  return session?.snapshot() ?? emptyVideoState()
}

function tick(): void {
  const nextId = videoIdFromUrl(location.href)
  const nextVideo = nextId ? videoForPage(nextId) : null
  if (nextId === videoId && nextVideo === video) {
    session?.refreshChrome()
    return
  }
  session?.dispose()
  session = null
  videoId = nextId
  video = nextVideo
  if (nextId && nextVideo) {
    session = new WatchSession(nextId, nextVideo)
    session.start()
  }
}

function boot(): void {
  document.addEventListener("yt-navigate-finish", tick)
  document.addEventListener("yt-navigate-start", () => {
    session?.dispose()
    session = null
    videoId = null
    video = null
  })
  window.addEventListener("popstate", tick)
  window.setInterval(tick, 500)
  tick()

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object" || !("type" in message)) return undefined
    if (message.type === "get-video-state") {
      sendResponse(currentState())
      return true
    }
    if (message.type === "skip-current") {
      session?.manualSkip()
      sendResponse({ ok: true })
      return true
    }
    return undefined
  })
}

boot()
