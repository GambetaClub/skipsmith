const VIDEO_ID = /^[A-Za-z0-9_-]{6,20}$/

function hostOf(url: URL): string {
  return url.hostname.replace(/^www\./, "")
}

export function videoIdFromUrl(input: string): string | null {
  let url: URL
  try {
    url = new URL(input)
  } catch {
    return null
  }
  const host = hostOf(url)
  const known =
    host === "youtube.com" ||
    host === "m.youtube.com" ||
    host === "music.youtube.com" ||
    host === "youtube-nocookie.com" ||
    host === "youtu.be"
  if (!known) return null

  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0]
    return id && VIDEO_ID.test(id) ? id : null
  }

  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v")
    return id && VIDEO_ID.test(id) ? id : null
  }

  const parts = url.pathname.split("/").filter(Boolean)
  if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live" || parts[0] === "v") {
    const id = parts[1]
    return id && VIDEO_ID.test(id) ? id : null
  }
  return null
}
