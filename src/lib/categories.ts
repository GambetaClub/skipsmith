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

/** SponsorBlock category ids. Colours are the ones viewers already know from the project. */
export const CATEGORIES: readonly CategoryInfo[] = [
  {
    id: "sponsor",
    label: "Sponsor",
    shortLabel: "sponsor",
    description: "Paid promotions and sponsor reads.",
    color: "#00d400",
    defaultMode: "auto",
  },
  {
    id: "selfpromo",
    label: "Unpaid / self promotion",
    shortLabel: "self promotion",
    description: "Unpaid plugs for the creator's other work.",
    color: "#ffff00",
    defaultMode: "auto",
  },
  {
    id: "interaction",
    label: "Interaction reminder",
    shortLabel: "interaction reminder",
    description: "Asks to like, subscribe, or comment.",
    color: "#cc00ff",
    defaultMode: "auto",
  },
  {
    id: "intro",
    label: "Intro / intermission",
    shortLabel: "intro",
    description: "Intro animations and mid-video intermissions.",
    color: "#00ffff",
    defaultMode: "button",
  },
  {
    id: "outro",
    label: "Endcards / credits",
    shortLabel: "endcards",
    description: "End screens and credits.",
    color: "#0202ed",
    defaultMode: "button",
  },
  {
    id: "preview",
    label: "Preview / recap",
    shortLabel: "preview",
    description: "A recap of a previous part, or a preview of what comes next.",
    color: "#008fd6",
    defaultMode: "button",
  },
  {
    id: "hook",
    label: "Hook / greetings",
    shortLabel: "hook",
    description: "Cold opens and greeting tangents.",
    color: "#395699",
    defaultMode: "button",
  },
  {
    id: "music_offtopic",
    label: "Non-music section",
    shortLabel: "non-music section",
    description: "Spoken parts in a music clip.",
    color: "#ff9900",
    defaultMode: "off",
  },
  {
    id: "filler",
    label: "Filler / tangent",
    shortLabel: "filler",
    description: "Jokes and tangents. This one is easy to over-mark, so it starts off.",
    color: "#7300ff",
    defaultMode: "off",
  },
  {
    id: "exclusive_access",
    label: "Exclusive access",
    shortLabel: "exclusive access",
    description: "Marks the whole video as a paid promotion. Auto skip would skip the video, so it starts off.",
    color: "#008a5c",
    defaultMode: "off",
  },
  {
    id: "poi_highlight",
    label: "Highlight",
    shortLabel: "highlight",
    description: "A point of interest on the seek bar. Never skipped.",
    color: "#ff1684",
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
