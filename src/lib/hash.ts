export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** First 4 hex chars is the prefix SponsorBlock recommends for k-anonymity. */
export async function hashPrefix(videoId: string, length = 4): Promise<string> {
  const hex = await sha256Hex(videoId)
  return hex.slice(0, length)
}
