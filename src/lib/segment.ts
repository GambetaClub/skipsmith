export interface Segment {
  uuid: string
  category: string
  actionType: string
  start: number
  end: number
  /** Length SponsorBlock published for the video, when the media element does not know it yet. */
  videoDuration?: number
}

export interface VideoState {
  onVideo: boolean
  /** False when the URL is a video but the player element is not there yet. */
  attached: boolean
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
    attached: false,
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
