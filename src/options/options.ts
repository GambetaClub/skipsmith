import { CATEGORIES, MODE_LABELS, modesFor } from "../lib/categories"
import { DEBUG_LOG_KEY, formatDebug, type DebugEntry } from "../lib/debug-log"
import { resolveSettings, SETTINGS_KEY } from "../lib/settings"

const root = document.querySelector<HTMLElement>("#categories")
const remember = document.querySelector<HTMLInputElement>("#remember")
const shortcut = document.querySelector<HTMLElement>("#shortcut")
const savedNote = document.querySelector<HTMLElement>("#saved-note")
const debug = document.querySelector<HTMLInputElement>("#debug")
const debugLog = document.querySelector<HTMLElement>("#debug-log")
const debugClear = document.querySelector<HTMLButtonElement>("#debug-clear")

let settings = resolveSettings(undefined)
let saveTimer = 0

function requireElement<T extends Element>(element: T | null, name: string): T {
  if (!element) throw new Error(`Missing ${name}`)
  return element
}

function flashSaved(): void {
  const note = requireElement(savedNote, "saved note")
  note.textContent = "Saved on this browser."
  window.clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => {
    note.textContent = ""
  }, 1400)
}

async function persist(): Promise<void> {
  await chrome.storage.local.set({ [SETTINGS_KEY]: settings })
  flashSaved()
}

function render(): void {
  const list = requireElement(root, "categories")
  list.replaceChildren()
  for (const category of CATEGORIES) {
    const card = document.createElement("article")
    card.className = "category"
    const header = document.createElement("header")
    const swatch = document.createElement("span")
    swatch.className = "swatch"
    swatch.style.background = category.color
    const text = document.createElement("div")
    const heading = document.createElement("h2")
    heading.textContent = category.label
    const hint = document.createElement("p")
    hint.className = "hint"
    hint.textContent = category.description
    text.append(heading, hint)
    header.append(swatch, text)

    const modes = document.createElement("div")
    modes.className = "modes"
    modes.setAttribute("role", "radiogroup")
    modes.setAttribute("aria-label", category.label)
    const current = settings.modes[category.id] ?? category.defaultMode
    for (const mode of modesFor(category.id)) {
      const label = document.createElement("label")
      const input = document.createElement("input")
      input.type = "radio"
      input.name = category.id
      input.value = mode
      input.checked = current === mode
      input.addEventListener("change", () => {
        if (!input.checked) return
        settings = {
          ...settings,
          modes: { ...settings.modes, [category.id]: mode },
        }
        void persist()
      })
      label.append(input, document.createTextNode(MODE_LABELS[mode]))
      modes.append(label)
    }
    card.append(header, modes)
    list.append(card)
  }
  requireElement(remember, "remember").checked = settings.rememberSpeed
  requireElement(debug, "debug").checked = settings.debug
  const log = requireElement(debugLog, "debug log")
  const clear = requireElement(debugClear, "debug clear")
  log.hidden = !settings.debug
  clear.hidden = !settings.debug
}

requireElement(remember, "remember").addEventListener("change", () => {
  settings = { ...settings, rememberSpeed: requireElement(remember, "remember").checked }
  void persist()
})

requireElement(debug, "debug").addEventListener("change", () => {
  settings = { ...settings, debug: requireElement(debug, "debug").checked }
  void persist().then(async () => {
    render()
    await loadLog()
  })
})

requireElement(debugClear, "debug clear").addEventListener("click", () => {
  void chrome.storage.local.set({ [DEBUG_LOG_KEY]: [] }).then(() => showLog([]))
})

function isDebugEntry(value: unknown): value is DebugEntry {
  if (typeof value !== "object" || value === null) return false
  const entry = value as Partial<DebugEntry>
  return typeof entry.at === "number" && typeof entry.source === "string" && typeof entry.message === "string"
}

function showLog(stored: unknown): void {
  const entries = Array.isArray(stored) ? stored.filter(isDebugEntry) : []
  const log = requireElement(debugLog, "debug log")
  log.textContent = entries.length === 0 ? "Nothing recorded yet. Open a YouTube video." : formatDebug(entries)
}

async function loadLog(): Promise<void> {
  const stored = await chrome.storage.local.get(DEBUG_LOG_KEY)
  showLog(stored[DEBUG_LOG_KEY])
}

async function load(): Promise<void> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY)
  settings = resolveSettings(stored[SETTINGS_KEY])
  render()
  await loadLog()
  const commands = await chrome.commands.getAll()
  const skip = commands.find((command) => command.name === "skip-segment")
  requireElement(shortcut, "shortcut").textContent = skip?.shortcut || "Not assigned"
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local" || !changes[DEBUG_LOG_KEY]) return
  showLog(changes[DEBUG_LOG_KEY].newValue)
})

void load()
