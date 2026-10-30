import { categoryById, skipButtonText, toastText } from "../lib/categories"
import { evaluate, holdSegments, manualSkipTarget, type Flags } from "../lib/segment-logic"
import type { Segment, VideoState } from "../lib/segment"
import { resolveSettings, SETTINGS_KEY, type Settings } from "../lib/settings"
import { rateFor, rememberRate, resolveSpeeds, SPEEDS_KEY } from "../lib/speeds"
import {
  findPlayer,
  findProgressBar,
  isAdPlaying,
  isLivePlayback,
  readChannel,
  readTitle,
} from "./page"

const TOAST_MS = 7000
const RATE_GUARD_MS = 2000

interface Undo {
  from: number
  to: number
  uuids: string[]
  categories: string[]
  saved: number
  accounted: boolean
  retries: number
}

export class WatchSession {
  private settings: Settings = resolveSettings(undefined)
  private segments: Segment[] = []
  private flags: Record<string, Flags> = {}
  private previousTime = 0
  private initial = true
  private userSeek = false
  private programmatic = 0
  private activeSeek = 0
  private disposed = false
  private loading = true
  private error: string | null = null
  private excluded = false
  private channelId: string | null = null
  private channelName: string | null = null
  private title: string | null = null
  private undo: Undo | null = null
  private toastTimer = 0
  private ignoreRateUntil = 0
  private mutedByUs = false
  private mutedBefore: boolean | null = null
  private wasAd = false
  private markerRoot: HTMLDivElement | null = null
  private markerSignature = ""
  private button: HTMLButtonElement | null = null
  private toast: HTMLDivElement | null = null
  private toastText: HTMLSpanElement | null = null
  private readonly onTimeUpdate = (): void => {
    if (this.video.seeking || this.userSeek || this.programmatic > 0) return
    this.sample(false)
  }
  private readonly onSeeking = (): void => {
    if (this.programmatic > 0) return
    this.userSeek = true
  }
  private readonly onSeeked = (): void => {
    if (this.programmatic > 0) return
    this.userSeek = true
    this.sample(false)
    this.userSeek = false
  }
  private readonly onPlay = (): void => {
    this.sample(false)
  }
  private readonly onPause = (): void => {
    this.sample(false)
  }
  private readonly onDuration = (): void => {
    this.markerSignature = ""
    this.renderMarkers()
  }
  private readonly onMetadata = (): void => {
    if (this.disposed) return
    const time = this.video.currentTime || 0
    this.markerSignature = ""
    this.renderMarkers()
    const fresh = time < 1 || Math.abs(time - this.previousTime) > 1.5
    if (!fresh) return
    this.flags = {}
    this.undo = null
    this.hideToast()
    this.initial = true
    this.previousTime = time
    this.sample(true)
  }
  private readonly onRateChange = (): void => {
    if (!this.settings.rememberSpeed || this.disposed) return
    if (Date.now() < this.ignoreRateUntil) return
    const rate = this.video.playbackRate
    if (!Number.isFinite(rate)) return
    void this.persistRate(rate)
  }
  private readonly onStorage = (changes: { [key: string]: chrome.storage.StorageChange }, area: string): void => {
    if (area !== "local" || !changes[SETTINGS_KEY]) return
    this.settings = resolveSettings(changes[SETTINGS_KEY].newValue)
    this.excluded = this.channelExcluded()
    this.markerSignature = ""
    this.renderMarkers()
    if (!this.settings.enabled || this.excluded) {
      this.hideButton()
      this.applyMute([])
    }
    if (this.settings.rememberSpeed) void this.restoreSpeed()
    this.sample(false)
  }

  constructor(
    private readonly videoId: string,
    private readonly video: HTMLVideoElement,
  ) {}

  start(): void {
    this.previousTime = this.video.currentTime || 0
    this.video.addEventListener("timeupdate", this.onTimeUpdate)
    this.video.addEventListener("seeking", this.onSeeking)
    this.video.addEventListener("seeked", this.onSeeked)
    this.video.addEventListener("play", this.onPlay)
    this.video.addEventListener("pause", this.onPause)
    this.video.addEventListener("durationchange", this.onDuration)
    this.video.addEventListener("loadedmetadata", this.onMetadata)
    this.video.addEventListener("ratechange", this.onRateChange)
    chrome.storage.onChanged.addListener(this.onStorage)
    void this.boot()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.activeSeek += 1
    window.clearTimeout(this.toastTimer)
    this.video.removeEventListener("timeupdate", this.onTimeUpdate)
    this.video.removeEventListener("seeking", this.onSeeking)
    this.video.removeEventListener("seeked", this.onSeeked)
    this.video.removeEventListener("play", this.onPlay)
    this.video.removeEventListener("pause", this.onPause)
    this.video.removeEventListener("durationchange", this.onDuration)
    this.video.removeEventListener("loadedmetadata", this.onMetadata)
    this.video.removeEventListener("ratechange", this.onRateChange)
    chrome.storage.onChanged.removeListener(this.onStorage)
    this.applyMute([])
    this.markerRoot?.remove()
    this.button?.remove()
    this.toast?.remove()
    this.markerRoot = null
    this.button = null
    this.toast = null
  }

  refreshChrome(): void {
    if (this.disposed) return
    const channel = readChannel(this.video)
    const channelChanged = channel.id !== this.channelId && channel.id != null
    if (channel.id) this.channelId = channel.id
    if (channel.name) this.channelName = channel.name
    const title = readTitle()
    if (title) this.title = title
    const excluded = this.channelExcluded()
    if (excluded !== this.excluded) {
      this.excluded = excluded
      this.markerSignature = ""
      if (!excluded && this.segments.length === 0 && !this.loading && !this.error) void this.loadSegments()
    }
    if (channelChanged && this.settings.rememberSpeed) void this.restoreSpeed()
    this.renderMarkers()
    if (this.wasAd && !isAdPlaying(this.video)) {
      this.wasAd = false
      this.initial = true
      this.previousTime = this.video.currentTime
      this.sample(false)
    }
  }

  snapshot(): VideoState {
    return {
      onVideo: true,
      videoId: this.videoId,
      title: this.title,
      channelId: this.channelId,
      channelName: this.channelName,
      excluded: this.excluded,
      enabled: this.settings.enabled,
      loading: this.loading,
      error: this.error,
      segments: this.segments.map((segment) => ({ ...segment })),
    }
  }

  manualSkip(): void {
    if (this.disposed || !this.settings.enabled || this.excluded || this.blocked()) return
    const target = manualSkipTarget(this.video.currentTime, this.segments, this.settings.modes, this.video.duration)
    if (!target) return
    this.flags = holdSegments(this.flags, target.uuids)
    this.beginSkip(this.video.currentTime, target.end, target.uuids, target.categories)
  }

  private async boot(): Promise<void> {
    const stored = await chrome.storage.local.get(SETTINGS_KEY)
    if (this.disposed) return
    this.settings = resolveSettings(stored[SETTINGS_KEY])
    this.refreshChrome()
    this.excluded = this.channelExcluded()
    if (!this.excluded) await this.loadSegments()
    else this.loading = false
    if (this.disposed) return
    if (this.settings.rememberSpeed) await this.restoreSpeed()
    this.initial = true
    this.previousTime = this.video.currentTime || 0
    this.renderMarkers()
    this.sample(true)
  }

  private async loadSegments(): Promise<void> {
    this.loading = true
    this.error = null
    if (!chrome.runtime?.id) {
      this.loading = false
      this.error = "Reload this tab to reconnect Skipsmith."
      return
    }
    try {
      const response: unknown = await chrome.runtime.sendMessage({ type: "fetch-segments", videoId: this.videoId })
      if (this.disposed) return
      if (!isFetchOk(response)) {
        this.segments = []
        this.error = response && typeof response === "object" && "error" in response && typeof response.error === "string"
          ? response.error
          : "SponsorBlock didn't respond."
      } else if (response.videoId && response.videoId !== this.videoId) {
        return
      } else {
        this.segments = response.segments
        this.error = null
      }
    } catch {
      if (this.disposed) return
      this.segments = []
      this.error = "SponsorBlock didn't respond."
    } finally {
      if (!this.disposed) {
        this.loading = false
        this.markerSignature = ""
        this.renderMarkers()
      }
    }
  }

  private channelExcluded(): boolean {
    return this.channelId != null && this.settings.excludedChannels.includes(this.channelId)
  }

  private blocked(): boolean {
    if (isAdPlaying(this.video)) {
      this.wasAd = true
      this.hideButton()
      this.renderMarkers()
      return true
    }
    return isLivePlayback(this.video)
  }

  private sample(initialOverride: boolean): void {
    if (this.disposed) return
    this.renderMarkers()
    if (!this.settings.enabled || this.excluded || this.blocked()) {
      this.applyMute([])
      this.hideButton()
      this.previousTime = this.video.currentTime
      this.initial = false
      return
    }
    const decision = evaluate({
      previousTime: this.previousTime,
      currentTime: this.video.currentTime,
      playbackRate: this.video.playbackRate || 1,
      duration: Number.isFinite(this.video.duration) ? this.video.duration : 0,
      playing: !this.video.paused,
      initial: initialOverride || this.initial,
      userSeek: this.userSeek,
      programmatic: false,
      segments: this.segments,
      modes: this.settings.modes,
      flags: this.flags,
    })
    this.flags = decision.flags
    this.initial = false
    if (decision.skipTo != null) {
      this.beginSkip(this.video.currentTime, decision.skipTo, decision.skipUuids, decision.skipCategories)
      return
    }
    this.previousTime = this.video.currentTime
    this.applyMute(decision.muteUuids)
    this.renderButton(decision.button?.category ?? null)
  }

  private beginSkip(from: number, to: number, uuids: string[], categories: string[]): void {
    const destination = clampToDuration(to, this.video.duration)
    if (destination <= from + 0.12) return
    this.undo = { from, to: destination, uuids, categories, saved: 0, accounted: false, retries: 0 }
    this.seekTo(destination)
  }

  private seekTo(time: number): void {
    const token = ++this.activeSeek
    const before = this.video.currentTime
    if (Math.abs(before - time) < 0.05) {
      this.finishSeek(token)
      return
    }
    let settled = false
    const finish = (): void => {
      if (settled || token !== this.activeSeek) return
      settled = true
      this.video.removeEventListener("seeked", finish)
      if (this.programmatic > 0) this.programmatic -= 1
      this.finishSeek(token)
    }
    this.programmatic += 1
    this.video.addEventListener("seeked", finish)
    this.video.currentTime = time
    window.setTimeout(() => {
      if (token !== this.activeSeek) return
      if (!this.video.seeking) {
        finish()
        return
      }
      window.setTimeout(() => finish(), 800)
    }, 500)
  }

  private finishSeek(token: number): void {
    if (token !== this.activeSeek || this.disposed) return
    const undo = this.undo
    const landed = this.video.currentTime
    if (undo && landed < undo.to - 0.4 && undo.retries < 1 && this.stillInside(undo.uuids)) {
      undo.retries += 1
      this.seekTo(undo.to)
      return
    }
    if (undo && !undo.accounted) {
      const saved = Math.max(0, Math.min(landed, undo.to) - undo.from)
      if (saved >= 0.2) {
        undo.saved = saved
        undo.accounted = true
        void this.reportStats(saved, 1)
        this.showToast(undo.categories, categoryById(undo.categories[0] ?? "")?.color ?? "#3ddc84")
      }
    }
    this.previousTime = landed
    this.userSeek = false
    this.hideButton()
    this.applyMute([])
    if (!undo) this.renderButtonFromState()
  }

  private stillInside(uuids: readonly string[]): boolean {
    const time = this.video.currentTime
    return this.segments.some((segment) => uuids.includes(segment.uuid) && time >= segment.start && time < segment.end)
  }

  private unskip(): void {
    const undo = this.undo
    if (!undo || this.disposed) return
    this.hideToast()
    this.flags = holdSegments(this.flags, undo.uuids)
    if (undo.accounted) void this.reportStats(-undo.saved, -1)
    this.undo = null
    this.previousTime = undo.from
    this.seekTo(undo.from)
  }

  private renderButtonFromState(): void {
    if (!this.settings.enabled || this.excluded || this.blocked()) {
      this.hideButton()
      return
    }
    const decision = evaluate({
      previousTime: this.video.currentTime,
      currentTime: this.video.currentTime,
      playbackRate: this.video.playbackRate || 1,
      duration: Number.isFinite(this.video.duration) ? this.video.duration : 0,
      playing: false,
      initial: false,
      userSeek: false,
      programmatic: true,
      segments: this.segments,
      modes: this.settings.modes,
      flags: this.flags,
    })
    this.flags = decision.flags
    this.renderButton(decision.button?.category ?? null)
  }

  private renderButton(category: string | null): void {
    const player = findPlayer(this.video)
    if (!player || !category) {
      this.hideButton()
      return
    }
    if (!this.button) {
      const button = document.createElement("button")
      button.type = "button"
      button.className = "skipsmith-btn"
      const stop = (event: Event): void => {
        event.preventDefault()
        event.stopPropagation()
      }
      button.addEventListener("pointerdown", stop)
      button.addEventListener("mousedown", stop)
      button.addEventListener("click", (event) => {
        stop(event)
        this.manualSkip()
      })
      this.button = button
    }
    this.button.textContent = skipButtonText(category)
    this.button.hidden = false
    if (this.button.parentElement !== player) player.append(this.button)
  }

  private hideButton(): void {
    if (this.button) this.button.hidden = true
  }

  private showToast(categories: string[], color: string): void {
    const player = findPlayer(this.video)
    if (!player) return
    if (!this.toast || !this.toastText) {
      const toast = document.createElement("div")
      toast.className = "skipsmith-toast"
      toast.setAttribute("role", "status")
      const text = document.createElement("span")
      text.className = "skipsmith-toast-text"
      const unskip = document.createElement("button")
      unskip.type = "button"
      unskip.className = "skipsmith-unskip"
      unskip.textContent = "Unskip"
      const stop = (event: Event): void => {
        event.preventDefault()
        event.stopPropagation()
      }
      unskip.addEventListener("pointerdown", stop)
      unskip.addEventListener("mousedown", stop)
      unskip.addEventListener("click", (event) => {
        stop(event)
        this.unskip()
      })
      toast.append(text, unskip)
      this.toast = toast
      this.toastText = text
    }
    this.toastText.textContent = toastText(categories)
    this.toast.style.borderLeftColor = color
    this.toast.hidden = false
    if (this.toast.parentElement !== player) player.append(this.toast)
    window.clearTimeout(this.toastTimer)
    this.toastTimer = window.setTimeout(() => this.hideToast(), TOAST_MS)
  }

  private hideToast(): void {
    window.clearTimeout(this.toastTimer)
    if (this.toast) this.toast.hidden = true
  }

  private renderMarkers(): void {
    const bar = findProgressBar(this.video)
    const duration = this.video.duration
    const show =
      this.settings.enabled &&
      !this.excluded &&
      !isAdPlaying(this.video) &&
      !isLivePlayback(this.video) &&
      bar &&
      Number.isFinite(duration) &&
      duration > 0
    if (!show || !bar) {
      this.markerRoot?.remove()
      this.markerRoot = null
      this.markerSignature = ""
      return
    }
    const visible = this.segments.filter((segment) => (this.settings.modes[segment.category] ?? "off") !== "off")
    const signature = `${duration.toFixed(3)}|${visible
      .map((segment) => `${segment.uuid}:${segment.start}:${segment.end}:${this.settings.modes[segment.category]}`)
      .join(",")}`
    if (signature === this.markerSignature && this.markerRoot?.isConnected) return
    this.markerSignature = signature
    this.markerRoot?.remove()
    const root = document.createElement("div")
    root.className = "skipsmith-markers"
    root.setAttribute("aria-hidden", "true")
    for (const segment of visible) {
      const mark = document.createElement("div")
      const point = segment.end - segment.start < 0.25
      mark.className = point ? "skipsmith-marker skipsmith-marker-point" : "skipsmith-marker"
      mark.style.background = categoryById(segment.category)?.color ?? "#00d400"
      const left = (segment.start / duration) * 100
      mark.style.left = `${Math.min(100, Math.max(0, left))}%`
      if (!point) {
        const width = ((segment.end - segment.start) / duration) * 100
        mark.style.width = `${Math.max(0.3, Math.min(100 - left, width))}%`
      }
      root.append(mark)
    }
    bar.append(root)
    this.markerRoot = root
  }

  private applyMute(uuids: readonly string[]): void {
    if (uuids.length > 0) {
      if (!this.mutedByUs) {
        this.mutedBefore = this.video.muted
        this.mutedByUs = true
      }
      this.video.muted = true
      return
    }
    if (!this.mutedByUs) return
    this.video.muted = this.mutedBefore ?? false
    this.mutedByUs = false
    this.mutedBefore = null
  }

  private async restoreSpeed(): Promise<void> {
    const stored = await chrome.storage.local.get(SPEEDS_KEY)
    if (this.disposed || !this.settings.rememberSpeed) return
    const rate = rateFor(resolveSpeeds(stored[SPEEDS_KEY]), this.channelId)
    if (rate == null) return
    this.ignoreRateUntil = Date.now() + RATE_GUARD_MS
    const write = (): void => {
      if (this.disposed || Math.abs(this.video.playbackRate - rate) < 0.01) return
      this.video.playbackRate = rate
    }
    write()
    window.setTimeout(write, 400)
    window.setTimeout(write, 1200)
  }

  private async persistRate(rate: number): Promise<void> {
    const stored = await chrome.storage.local.get(SPEEDS_KEY)
    if (this.disposed) return
    const next = rememberRate(resolveSpeeds(stored[SPEEDS_KEY]), this.channelId, rate)
    await chrome.storage.local.set({ [SPEEDS_KEY]: next })
  }

  private reportStats(seconds: number, skips: number): Promise<void> {
    if (!chrome.runtime?.id) return Promise.resolve()
    return chrome.runtime.sendMessage({ type: "adjust-stats", seconds, skips }).then(() => undefined).catch(() => undefined)
  }
}

function clampToDuration(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return time
  return Math.min(time, duration)
}

function isFetchOk(value: unknown): value is { ok: true; segments: Segment[]; videoId?: string } {
  return typeof value === "object" && value !== null && "ok" in value && value.ok === true && "segments" in value && Array.isArray(value.segments)
}
