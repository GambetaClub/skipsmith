import { categoryById, MODE_LABELS } from "../lib/categories"
import { emptyVideoState, type Segment, type VideoState } from "../lib/segment"
import { resolveSettings, resolveStats, SETTINGS_KEY, STATS_KEY, type Settings } from "../lib/settings"
import { formatRange, formatSaved } from "../lib/time"

const power = document.querySelector<HTMLButtonElement>("#power")
const saved = document.querySelector<HTMLElement>("#saved")
const savedCaption = document.querySelector<HTMLElement>("#saved-caption")
const title = document.querySelector<HTMLElement>("#video-title")
const channel = document.querySelector<HTMLElement>("#channel")
const status = document.querySelector<HTMLElement>("#status")
const list = document.querySelector<HTMLUListElement>("#segments")
const exclude = document.querySelector<HTMLButtonElement>("#exclude")
const options = document.querySelector<HTMLButtonElement>("#options")

let settings = resolveSettings(undefined)
let state = emptyVideoState()

function requireElement<T extends Element>(element: T | null, name: string): T {
  if (!element) throw new Error(`Missing ${name}`)
  return element
}

async function writeSettings(next: Settings): Promise<void> {
  settings = next
  await chrome.storage.local.set({ [SETTINGS_KEY]: next })
}

function isVideoState(value: unknown): value is VideoState {
  return typeof value === "object" && value !== null && "onVideo" in value && "segments" in value
}

async function readVideo(): Promise<VideoState> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id == null) return emptyVideoState()
  try {
    const response: unknown = await chrome.tabs.sendMessage(tab.id, { type: "get-video-state" })
    return isVideoState(response) ? response : emptyVideoState()
  } catch {
    return emptyVideoState()
  }
}

function renderStats(seconds: number, skips: number): void {
  requireElement(saved, "saved").textContent = formatSaved(seconds)
  requireElement(savedCaption, "saved caption").textContent =
    skips === 1 ? "saved across 1 skip" : `saved across ${skips} skips`
}

function segmentRow(segment: Segment): HTMLLIElement {
  const info = categoryById(segment.category)
  const mode = settings.modes[segment.category] ?? "off"
  const item = document.createElement("li")
  const swatch = document.createElement("span")
  swatch.className = "swatch"
  swatch.style.background = info?.color ?? "#00d400"
  const label = document.createElement("span")
  label.className = "seg-label"
  const action = segment.actionType === "mute" ? " · mute" : segment.actionType === "full" ? " · full video" : ""
  label.textContent = `${info?.label ?? segment.category}${action}`
  const meta = document.createElement("span")
  meta.className = "seg-meta"
  meta.textContent = `${formatRange(segment.start, segment.end)} · ${MODE_LABELS[mode]}`
  item.append(swatch, label, meta)
  return item
}

function render(): void {
  const powerButton = requireElement(power, "power")
  powerButton.setAttribute("aria-pressed", String(settings.enabled))
  powerButton.querySelector(".power-label")!.textContent = settings.enabled ? "On" : "Off"

  const heading = requireElement(title, "title")
  const note = requireElement(status, "status")
  const rows = requireElement(list, "segments")
  const channelLine = requireElement(channel, "channel")
  const excludeButton = requireElement(exclude, "exclude")
  rows.replaceChildren()

  if (!state.onVideo) {
    heading.textContent = "No video open"
    channelLine.hidden = true
    note.textContent = "Open a YouTube video. Segments for it will show up here."
    excludeButton.hidden = true
    return
  }

  heading.textContent = state.title || "This video"
  if (state.channelName) {
    channelLine.hidden = false
    channelLine.textContent = state.channelName
  } else {
    channelLine.hidden = true
  }

  if (state.channelId) {
    excludeButton.hidden = false
    excludeButton.textContent = state.excluded ? "Include this channel" : "Don't skip this channel"
  } else {
    excludeButton.hidden = true
  }

  if (!settings.enabled) {
    note.textContent = "Skipping is off. The list below is still filled in."
  } else if (state.excluded) {
    note.textContent = "This channel is excluded. Nothing here will be skipped."
  } else if (state.loading) {
    note.textContent = "Asking SponsorBlock…"
  } else if (state.error) {
    note.textContent = state.error
  } else if (state.segments.length === 0) {
    note.textContent = "No segments submitted for this video."
  } else {
    note.textContent = ""
  }

  for (const segment of state.segments) rows.append(segmentRow(segment))
}

async function refresh(): Promise<void> {
  const stored = await chrome.storage.local.get([SETTINGS_KEY, STATS_KEY])
  settings = resolveSettings(stored[SETTINGS_KEY])
  const stats = resolveStats(stored[STATS_KEY])
  renderStats(stats.timeSavedSeconds, stats.skipCount)
  state = await readVideo()
  render()
}

requireElement(power, "power").addEventListener("click", () => {
  void writeSettings({ ...settings, enabled: !settings.enabled }).then(render)
})

requireElement(exclude, "exclude").addEventListener("click", () => {
  const channelId = state.channelId
  if (!channelId) return
  const excludedChannels = settings.excludedChannels.includes(channelId)
    ? settings.excludedChannels.filter((id) => id !== channelId)
    : [...settings.excludedChannels, channelId]
  void writeSettings({ ...settings, excludedChannels }).then(() => {
    state = { ...state, excluded: excludedChannels.includes(channelId) }
    render()
  })
})

requireElement(options, "options").addEventListener("click", () => {
  void chrome.runtime.openOptionsPage()
})

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return
  if (changes[STATS_KEY]) {
    const stats = resolveStats(changes[STATS_KEY].newValue)
    renderStats(stats.timeSavedSeconds, stats.skipCount)
  }
  if (changes[SETTINGS_KEY]) {
    settings = resolveSettings(changes[SETTINGS_KEY].newValue)
    if (state.channelId) state = { ...state, excluded: settings.excludedChannels.includes(state.channelId) }
    render()
  }
})

void refresh()
