export interface Segment {
  uuid: string
  category: string
  actionType: string
  start: number
  end: number
}

export interface VideoState {
  onVideo: boolean
  videoId: string | null
  title: string | null
  channelId: string | null
  channelName: string | null
  excluded: boolean
  enabled: boolean
  loading: boolean
  error: string | null
  segments: Segment[]
}

export function emptyVideoState(): VideoState {
  return {
    onVideo: false,
    videoId: null,
    title: null,
    channelId: null,
    channelName: null,
    excluded: false,
    enabled: true,
    loading: false,
    error: null,
    segments: [],
  }
}
