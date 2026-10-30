import { CATEGORIES, MODE_LABELS, modesFor } from "../lib/categories"
import { resolveSettings, SETTINGS_KEY } from "../lib/settings"

const root = document.querySelector<HTMLElement>("#categories")
const remember = document.querySelector<HTMLInputElement>("#remember")
const shortcut = document.querySelector<HTMLElement>("#shortcut")
const savedNote = document.querySelector<HTMLElement>("#saved-note")

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
}

requireElement(remember, "remember").addEventListener("change", () => {
  settings = { ...settings, rememberSpeed: requireElement(remember, "remember").checked }
  void persist()
})

async function load(): Promise<void> {
  const stored = await chrome.storage.local.get(SETTINGS_KEY)
  settings = resolveSettings(stored[SETTINGS_KEY])
  render()
  const commands = await chrome.commands.getAll()
  const skip = commands.find((command) => command.name === "skip-segment")
  requireElement(shortcut, "shortcut").textContent = skip?.shortcut || "Not assigned"
}

void load()
