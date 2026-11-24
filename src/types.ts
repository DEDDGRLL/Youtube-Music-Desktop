export interface Artist {
  name: string;
  id: string;
}

export interface Track {
  kind: 'track';
  id: string;
  title: string;
  artist: string;
  artists: Artist[];
  album?: string;
  albumId?: string;
  duration?: number;
  thumb: string;
}

export interface Collection {
  kind: 'playlist' | 'album' | 'artist';
  id: string;
  title: string;
  subtitle: string;
  thumb: string;
}

export type Item = Track | Collection;

export interface Shelf {
  title: string;
  items: Item[];
}

/** What the hidden player page can and can't see, reported about every 2 seconds. */
export interface Diag {
  url: string;
  player: boolean;
  playerApi: boolean;
  playerBar: boolean;
  video: boolean;
  shuffleButton: boolean;
  repeatButton: boolean;
  likeButton: boolean;
  volumeSlider: boolean;
  queueItems: number;
  repeatRead: string | null;
  repeatAttribute: string | null;
  playerState: number | null;
  wantPlaying: boolean;
  ad: boolean;
  adsSeen: number;
  recoveries: number;
  lastLoad: { method: string; why?: string; ms?: number; ok?: boolean } | null;
  queueStrikes: number;
  visibility: string;
  mediaSession: boolean;
  bridgeOk: number;
  bridgeFailed: number;
  bridgeLastError: string;
}

export interface PlayerState {
  videoId: string;
  title: string;
  artist: string;
  thumb: string;
  artists: Artist[];
  albumId: string;
  albumName: string;
  playing: boolean;
  position: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: string;
  /** Playlist the current song was started from (empty for a single song). */
  listId: string;
  /** An advertisement is playing (the song fields still describe the song that was playing). */
  ad: boolean;
  diag?: Diag;
  /** When the app last heard from the player (milliseconds since 1970), set by the app. */
  at?: number;
}

export type SearchType = 'all' | 'song' | 'album' | 'artist' | 'playlist';

export type View =
  | { name: 'home' }
  | { name: 'library' }
  | { name: 'search'; query: string; type?: SearchType }
  | { name: 'liked' }
  | { name: 'settings' }
  | { name: 'stats' }
  | { name: 'browse'; browseId: string; params?: string; title: string }
  | { name: 'artist'; id: string; title?: string }
  | { name: 'collection'; collection: Collection };
