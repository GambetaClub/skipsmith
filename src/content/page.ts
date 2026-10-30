export interface ChannelInfo {
  id: string | null
  name: string | null
}

export function videoForPage(videoId: string): HTMLVideoElement | null {
  const video = findMainVideo()
  if (!video) return null
  if (location.pathname === "/watch") {
    const flexyId = document.querySelector("ytd-watch-flexy")?.getAttribute("video-id")
    if (flexyId && flexyId !== videoId) return null
  }
  return video
}

export function findMainVideo(): HTMLVideoElement | null {
  const activeShort = document.querySelector("ytd-reel-video-renderer[is-active] video")
  if (activeShort instanceof HTMLVideoElement) return activeShort

  const movie = document.querySelector("#movie_player video")
  if (movie instanceof HTMLVideoElement) return movie

  const embed = document.querySelector(".html5-video-player video.html5-main-video")
  if (embed instanceof HTMLVideoElement) return embed

  return null
}

export function findPlayer(video: HTMLVideoElement): HTMLElement | null {
  const player = video.closest(".html5-video-player")
  if (player instanceof HTMLElement) return player
  return video.parentElement instanceof HTMLElement ? video.parentElement : null
}

export function findProgressBar(video: HTMLVideoElement): HTMLElement | null {
  const scopes: Element[] = []
  const player = video.closest(".html5-video-player")
  if (player) scopes.push(player)
  const reel = video.closest("ytd-reel-video-renderer, ytd-shorts")
  if (reel) scopes.push(reel)

  const selectors = [".ytp-progress-bar", ".ytPlayerProgressBarProgressBar", ".ytProgressBarLine", "#scrubber"]
  for (const scope of scopes) {
    for (const selector of selectors) {
      const found = scope.querySelector(selector)
      if (found instanceof HTMLElement) return found
    }
  }
  return null
}

function channelFromAnchor(anchor: HTMLAnchorElement | null): string | null {
  if (!anchor) return null
  const href = anchor.getAttribute("href") ?? ""
  const channel = href.match(/\/channel\/(UC[\w-]{8,})/)
  if (channel) return channel[1]
  const handle = href.match(/^\/@[^/?#]+/)
  if (handle) return handle[0]
  return null
}

export function readChannel(video: HTMLVideoElement | null): ChannelInfo {
  const scopes: ParentNode[] = []
  const reel = video?.closest("ytd-reel-video-renderer")
  if (reel) scopes.push(reel)
  const watch = document.querySelector("ytd-watch-flexy")
  if (watch) scopes.push(watch)
  scopes.push(document)

  const selectors = [
    "a[href*='/channel/UC']",
    "a[href^='/@']",
    "ytd-channel-name a",
    "#channel-name a",
    "#owner a",
  ]

  let id: string | null = null
  let name: string | null = null
  for (const scope of scopes) {
    for (const selector of selectors) {
      const anchor = scope.querySelector(selector)
      if (!(anchor instanceof HTMLAnchorElement)) continue
      id = id ?? channelFromAnchor(anchor)
      const text = anchor.textContent?.trim()
      if (!name && text) name = text
      if (id && name) return { id, name }
    }
  }
  return { id, name }
}

export function readTitle(): string | null {
  const heading = document.querySelector(
    "h1.ytd-watch-metadata yt-formatted-string, ytd-watch-metadata h1 yt-formatted-string, h1.ytd-video-primary-info-renderer",
  )
  const headingText = heading?.textContent?.trim()
  if (headingText) return headingText

  const meta = document.querySelector('meta[name="title"]')
  const metaText = meta?.getAttribute("content")?.trim()
  if (metaText) return metaText

  const shorts = document.querySelector("ytd-reel-video-renderer[is-active] h2, #shorts-title")
  const shortsText = shorts?.textContent?.trim()
  if (shortsText) return shortsText

  const fromDocument = document.title.replace(/\s+-\s+YouTube$/, "").trim()
  return fromDocument || null
}

export function isAdPlaying(video: HTMLVideoElement): boolean {
  const player = video.closest(".html5-video-player")
  return player instanceof HTMLElement && player.classList.contains("ad-showing")
}

export function isLivePlayback(video: HTMLVideoElement): boolean {
  if (!Number.isFinite(video.duration)) return true
  const player = video.closest(".html5-video-player")
  if (!(player instanceof HTMLElement)) return false
  if (player.classList.contains("ytp-live")) return true
  const badge = player.querySelector(".ytp-live-badge")
  if (!(badge instanceof HTMLElement)) return false
  return getComputedStyle(badge).display !== "none" && !badge.hasAttribute("disabled")
}
