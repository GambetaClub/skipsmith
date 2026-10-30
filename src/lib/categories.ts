export const CATEGORY_MODES = ["auto", "button", "seekbar", "off"] as const

export type CategoryMode = (typeof CATEGORY_MODES)[number]

export interface CategoryInfo {
  id: string
  label: string
  shortLabel: string
  description: string
  color: string
  defaultMode: CategoryMode
}

/**
 * Muted seek-bar colours. Sponsor is a deep maroon so it stays distinct from
 * YouTube's played-progress red (#ff0000) and from the grey buffered bar.
 * Markers are drawn at MARKER_OPACITY.
 */
export const MARKER_OPACITY = 0.85

export const CATEGORIES: readonly CategoryInfo[] = [
  {
    id: "sponsor",
    label: "Sponsor",
    shortLabel: "sponsor",
    description: "Paid promotions and sponsor reads.",
    color: "#7a0f12",
    defaultMode: "auto",
  },
  {
    id: "selfpromo",
    label: "Unpaid / self promotion",
    shortLabel: "self promotion",
    description: "Unpaid plugs for the creator's other work.",
    color: "#8a6b2a",
    defaultMode: "auto",
  },
  {
    id: "interaction",
    label: "Interaction reminder",
    shortLabel: "interaction reminder",
    description: "Asks to like, subscribe, or comment.",
    color: "#6e4a86",
    defaultMode: "auto",
  },
  {
    id: "intro",
    label: "Intro / intermission",
    shortLabel: "intro",
    description: "Intro animations and mid-video intermissions.",
    color: "#3e6f73",
    defaultMode: "button",
  },
  {
    id: "outro",
    label: "Endcards / credits",
    shortLabel: "endcards",
    description: "End screens and credits.",
    color: "#3a4678",
    defaultMode: "button",
  },
  {
    id: "preview",
    label: "Preview / recap",
    shortLabel: "preview",
    description: "A recap of a previous part, or a preview of what comes next.",
    color: "#3d6d8c",
    defaultMode: "button",
  },
  {
    id: "hook",
    label: "Hook / greetings",
    shortLabel: "hook",
    description: "Cold opens and greeting tangents.",
    color: "#4e5d73",
    defaultMode: "button",
  },
  {
    id: "music_offtopic",
    label: "Non-music section",
    shortLabel: "non-music section",
    description: "Spoken parts in a music clip.",
    color: "#8a4f28",
    defaultMode: "off",
  },
  {
    id: "filler",
    label: "Filler / tangent",
    shortLabel: "filler",
    description: "Jokes and tangents. This one is easy to over-mark, so it starts off.",
    color: "#5c4a78",
    defaultMode: "off",
  },
  {
    id: "exclusive_access",
    label: "Exclusive access",
    shortLabel: "exclusive access",
    description: "Marks the whole video as a paid promotion. Auto skip would skip the video, so it starts off.",
    color: "#2f6150",
    defaultMode: "off",
  },
  {
    id: "poi_highlight",
    label: "Highlight",
    shortLabel: "highlight",
    description: "A point of interest on the seek bar. Never skipped.",
    color: "#8a3e5c",
    defaultMode: "seekbar",
  },
]

export const MODE_LABELS: Record<CategoryMode, string> = {
  auto: "Auto skip",
  button: "Skip button",
  seekbar: "Seek bar only",
  off: "Off",
}

const BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]))

export function categoryById(id: string): CategoryInfo | undefined {
  return BY_ID.get(id)
}

export function defaultColors(): Record<string, string> {
  const colors: Record<string, string> = {}
  for (const category of CATEGORIES) colors[category.id] = category.color
  return colors
}

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/.test(value)
}

export function colorFor(colors: Readonly<Record<string, string>>, categoryId: string): string {
  const custom = colors[categoryId]
  if (isHexColor(custom)) return custom
  return categoryById(categoryId)?.color ?? "#7a0f12"
}

export function defaultModes(): Record<string, CategoryMode> {
  const modes: Record<string, CategoryMode> = {}
  for (const category of CATEGORIES) modes[category.id] = category.defaultMode
  return modes
}

export function modesFor(categoryId: string): readonly CategoryMode[] {
  if (categoryId === "poi_highlight") return ["seekbar", "off"]
  return CATEGORY_MODES
}

export function isCategoryMode(value: unknown): value is CategoryMode {
  return value === "auto" || value === "button" || value === "seekbar" || value === "off"
}

export function toastText(categories: readonly string[]): string {
  const labels = categories.map((id) => categoryById(id)?.shortLabel ?? id)
  if (labels.length === 0) return "Skipped segment"
  if (labels.length === 1) return `Skipped ${labels[0]}`
  if (labels.length === 2) return `Skipped ${labels[0]} and ${labels[1]}`
  return `Skipped ${labels.length} segments`
}

export function skipButtonText(category: string): string {
  return `Skip ${categoryById(category)?.shortLabel ?? category}`
}
