import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useSyncExternalStore } from 'react';
import type { PlayerState, Track } from '../types';

const EMPTY: PlayerState = {
  videoId: '',
  title: '',
  artist: '',
  thumb: '',
  artists: [],
  albumId: '',
  albumName: '',
  playing: false,
  position: 0,
  duration: 0,
  volume: 100,
  shuffle: false,
  repeat: 'NONE',
  listId: '',
  ad: false,
};

let state: PlayerState = EMPTY;
const subs = new Set<() => void>();
const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

/** Start listening to state pushed from the hidden YouTube Music player. */
function set(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  subs.forEach((fn) => fn());
}

// After asking for a new track, ignore stale reports about the old one until the switch lands.
let pending: { id: string; until: number } | null = null;

export async function initPlayerBridge() {
  await listen<PlayerState>('player-state', (e) => {
    if (pending) {
      if (e.payload.videoId === pending.id || Date.now() > pending.until) pending = null;
      else return;
    }
    // The page fills in artist/album links a moment after the song starts; don't lose ones we already know.
    const same = e.payload.videoId === state.videoId;
    const p = e.payload;
    state = {
      ...p,
      artists: p.artists?.length ? p.artists : same ? state.artists : [],
      albumId: p.albumId || (same ? state.albumId : ''),
      albumName: p.albumName || (same ? state.albumName : ''),
      listId: p.listId || (same ? state.listId : ''),
      ad: !!p.ad,
      // Diagnostics arrive every couple of seconds; keep the last copy in between.
      diag: p.diag ?? state.diag,
      at: Date.now(),
    };
    subs.forEach((fn) => fn());
  });
}

/** Be called with the full player state after every update (for code outside React). */
export function subscribeState(fn: (s: PlayerState) => void) {
  const handler = () => fn(state);
  subs.add(handler);
  return () => { subs.delete(handler); };
}

/** Subscribe to a slice of player state. Selector must return a primitive. */
export function usePlayerSel<T>(sel: (s: PlayerState) => T): T {
  return useSyncExternalStore(subscribe, () => sel(state));
}


// useSyncExternalStore needs a stable snapshot, so usePlayer uses a dedicated store hook:
export function usePlayerFull(): PlayerState {
  return useSyncExternalStore(subscribe, () => state);
}

type Method =
  | 'toggle' | 'play' | 'pause' | 'next' | 'prev'
  | 'seek' | 'volume' | 'shuffle' | 'repeat' | 'load';

const call = (method: Method, ...args: unknown[]) =>
  invoke('player_call', { method, args }).catch(console.error);

export const player = {
  toggle: () => { set({ playing: !state.playing }); return call('toggle'); },
  next: () => call('next'),
  prev: () => call('prev'),
  seek: (s: number) => call('seek', s),
  // The hidden player page stores the volume itself and re-applies it on every load.
  volume: (v: number) => call('volume', v),
  shuffle: () => call('shuffle'),
  repeat: () => call('repeat'),
  /** Play a track; pass playlistId so YouTube Music queues the rest of the list. */
  load: (t: Pick<Track, 'id' | 'title' | 'artist' | 'thumb'> & Partial<Pick<Track, 'artists' | 'albumId' | 'album'>>, playlistId?: string) => {
    pending = { id: t.id, until: Date.now() + 5000 };
    set({ videoId: t.id, title: t.title, artist: t.artist, thumb: t.thumb, artists: t.artists ?? [], albumId: t.albumId ?? '', albumName: t.album ?? '', listId: playlistId ?? '', playing: true, position: 0, duration: 0 });
    return call('load', t.id, playlistId ?? null);
  },
};

export const windows = {
  toggleMini: () => invoke('toggle_mini'),
  showMain: () => invoke('show_main_window'),
};

export const auth = {
  cookies: () => invoke<string>('get_cookies'),
  showLogin: () => invoke('show_login'),
  hideLogin: () => invoke('hide_login'),
  signOut: () => invoke('sign_out'),
  showPlayer: () => invoke('show_player'),
};
