import { Innertube } from 'youtubei.js/web';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { Artist, Collection, Item, Shelf, Track } from '../types';

let yt: Innertube | null = null;

/**
 * Create an InnerTube session using the signed-in cookies from the player webview.
 * Requests go through Tauri's HTTP plugin so we can send Cookie/Origin headers (browsers forbid them).
 */
export async function connect(cookie: string) {
  // youtubei.js reads SAPISID to sign requests; some sessions only expose the __Secure-3PAPISID twin.
  if (!/(^|;\s*)SAPISID=/.test(cookie)) {
    const alt = cookie.match(/(?:^|;\s*)__Secure-3PAPISID=([^;]+)/);
    if (alt) cookie += `; SAPISID=${alt[1]}`;
  }
  const authedFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input as RequestInfo, init);
    const headers = new Headers(req.headers);
    headers.set('Cookie', cookie);
    // The SAPISIDHASH signature is bound to https://www.youtube.com, so Origin must match it exactly.
    headers.set('Origin', 'https://www.youtube.com');
    headers.set('Referer', 'https://www.youtube.com/');
    headers.set('User-Agent', navigator.userAgent);
    const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : await req.arrayBuffer();
    return tauriFetch(req.url, { method: req.method, headers, body });
  };
  yt = await Innertube.create({
    cookie,
    fetch: authedFetch as typeof fetch,
    generate_session_locally: true,
    retrieve_player: false,
  });
}

const api = () => {
  if (!yt) throw new Error('Not connected');
  return yt.music;
};

// ---------- normalisers (InnerTube nodes are loosely typed, so stay defensive) ----------

const text = (t: any): string => (typeof t === 'string' ? t : t?.text ?? '');

const thumb = (x: any): string => {
  const arr = Array.isArray(x) ? x : x?.contents;
  return arr?.length ? arr[arr.length - 1].url : '';
};

/** Googleusercontent thumbnails carry a size suffix; ask for a bigger one. */
export const hiRes = (url: string, px = 544) =>
  url.replace(/=w\d+-h\d+[^\s]*$/, `=w${px}-h${px}-l90-rj`);

function toTrack(i: any): Track | null {
  const t = i?.item_type;
  if ((t === 'song' || t === 'video' || t === 'non_music_track') && i.id) {
    const raw = (i.artists ?? i.authors ?? []).filter((a: any) => a?.name);
    const artists: Artist[] = raw.map((a: any) => ({ name: a.name, id: a.channel_id ?? '' })).filter((a: Artist) => a.id);
    return {
      kind: 'track',
      id: i.id,
      title: text(i.title),
      artist: raw.map((a: any) => a.name).join(', ') || i.author?.name || '',
      artists,
      album: i.album?.name,
      albumId: i.album?.id,
      duration: i.duration?.seconds,
      thumb: thumb(i.thumbnail),
    };
  }
  return null;
}

function toCollection(i: any): Collection | null {
  const t = i?.item_type;
  if (!i?.id || (t !== 'playlist' && t !== 'album' && t !== 'artist')) return null;
  return {
    kind: t,
    id: i.id,
    title: text(i.title) || i.name || '',
    subtitle: text(i.subtitle) || i.author?.name || '',
    thumb: thumb(i.thumbnail),
  };
}

const toItem = (i: any): Item | null => toTrack(i) ?? toCollection(i);
const items = (list: any[] | undefined): Item[] => (list ?? []).map(toItem).filter((x): x is Item => !!x);

/** Strip YouTube's "VL" browse prefix to get the real playlist id used for playback. */
export const playlistIdOf = (id: string) => (id.startsWith('VL') ? id.slice(2) : id);

// ---------- public data API ----------

export async function homeFeed(): Promise<Shelf[]> {
  const feed: any = await api().getHomeFeed();
  return (feed.sections ?? [])
    .map((s: any) => ({ title: text(s.header?.title), items: items(s.contents) }))
    .filter((s: Shelf) => s.items.length);
}

/** Search everything, or narrow it to one kind of result (songs, albums, artists, playlists). */
export async function search(query: string, type?: 'song' | 'album' | 'artist' | 'playlist'): Promise<Shelf[]> {
  const res: any = await api().search(query, type ? ({ type } as any) : undefined);
  return (res.contents ?? [])
    .map((s: any) => ({ title: text(s.title) || 'Top result', items: items(s.contents) }))
    .filter((s: Shelf) => s.items.length);
}

export async function libraryPlaylists(): Promise<Collection[]> {
  let lib: any = await api().getLibrary();
  const out: Collection[] = [];
  const collect = (sections: any[] | undefined) => {
    for (const sec of sections ?? []) {
      for (const it of sec.items ?? sec.contents ?? []) {
        const c = toCollection(it);
        if (c) out.push(c);
      }
    }
  };
  collect(lib.contents);
  for (let n = 0; n < 3 && lib.has_continuation; n++) {
    lib = await lib.getContinuation();
    const c = lib.contents;
    collect(c ? [c] : []);
  }
  return out;
}

export interface TrackPage {
  title: string;
  subtitle: string;
  thumb: string;
  tracks: Track[];
  /** Playlist id handed to YouTube Music so it queues the whole list. */
  playlistId?: string;
  /** True for playlists you own and can change. */
  editable?: boolean;
}

const pageCache = new Map<string, TrackPage>();
/** Last fully loaded copy of a page, so revisiting it is instant (it is refreshed in the background). */
export const peek = (key: string) => pageCache.get(key);

/**
 * Load a playlist. `onProgress` fires after every page of results, so the UI can show the first
 * songs straight away instead of waiting for the whole list.
 */
export async function playlist(id: string, max = 500, onProgress?: (page: TrackPage) => void): Promise<TrackPage> {
  let pl: any = await api().getPlaylist(id);
  const h = pl.header; // only the first response carries the header
  const tracks: Track[] = [];
  const build = (): TrackPage => ({
    title: text(h?.title),
    subtitle: text(h?.subtitle) || `${tracks.length} songs`,
    thumb: thumb(h?.thumbnails ?? h?.thumbnail) || tracks[0]?.thumb || '',
    tracks: [...tracks],
    playlistId: playlistIdOf(id),
    editable: h?.type === 'MusicEditablePlaylistDetailHeader',
  });
  for (let n = 0; n < 40; n++) {
    for (const it of pl.items ?? []) {
      const t = toTrack(it);
      if (t) tracks.push(t);
    }
    onProgress?.(build());
    if (!pl.has_continuation || tracks.length >= max) break;
    pl = await pl.getContinuation();
  }
  const done = build();
  pageCache.set(`pl:${id}`, done);
  return done;
}

export async function album(id: string): Promise<TrackPage> {
  const a: any = await api().getAlbum(id);
  const h = a.header;
  const cover = thumb(h?.thumbnails ?? h?.thumbnail);
  const artist = h?.author?.name ?? '';
  const tracks = (a.contents ?? [])
    .map(toTrack)
    .filter((t: Track | null): t is Track => !!t)
    .map((t: Track) => ({ ...t, thumb: t.thumb || cover, artist: t.artist || artist }));
  let playlistId: string | undefined;
  try {
    playlistId = a.url ? new URL(a.url).searchParams.get('list') ?? undefined : undefined;
  } catch { /* ignore */ }
  const page = { title: text(h?.title), subtitle: artist, thumb: cover, tracks, playlistId };
  pageCache.set(`al:${id}`, page);
  return page;
}

export const likedSongs = (onProgress?: (page: TrackPage) => void) => playlist('LM', 3000, onProgress);

export interface ArtistPage {
  name: string;
  thumb: string;
  shelves: Shelf[];
  /** Set when the real artist page failed and these are search results instead. */
  note?: string;
}

/**
 * Load an artist page. If YouTube Music's artist page can't be loaded or parsed,
 * fall back to searching for the artist by name so the user still gets their music.
 */
export async function artist(id: string, nameHint = ''): Promise<ArtistPage> {
  const channelId = id.replace(/^MPLA/, '');
  try {
    const a: any = await api().getArtist(channelId);
    const shelves: Shelf[] = (a.sections ?? [])
      .map((s: any) => ({ title: text(s.header?.title) || text(s.title), items: items(s.contents) }))
      .filter((s: Shelf) => s.items.length);
    if (!shelves.length) throw new Error('artist page had no content');
    return { name: text(a.header?.title) || nameHint, thumb: thumb(a.header?.thumbnail), shelves };
  } catch (e: any) {
    if (!nameHint) throw e;
    const shelves = (await search(nameHint)).filter((sh) => sh.title !== 'Artists');
    return {
      name: nameHint,
      thumb: '',
      shelves,
      note: `Showing search results for “${nameHint}” because the artist page couldn’t be loaded (${String(e?.message ?? e)}).`,
    };
  }
}

/** Artwork URL: the reported thumbnail if it's a real image, otherwise YouTube's frame for the video. */
export const artUrl = (thumbUrl: string, videoId: string) =>
  thumbUrl && !thumbUrl.startsWith('data:') ? thumbUrl : videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '';

/** Plain-text lyrics from YouTube Music itself (not time-synced). Used as a fallback. */
export async function plainLyrics(videoId: string): Promise<string | null> {
  try {
    const l: any = await api().getLyrics(videoId);
    return text(l?.description) || null;
  } catch {
    return null;
  }
}

// ---------- look up ids by name (used when a name has no link data) ----------

const norm = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
/** Exact match first; otherwise one name containing the other. Never an unrelated first result. */
const pickByName = <T extends { title: string }>(list: T[], name: string): T | undefined =>
  list.find((c) => norm(c.title) === norm(name)) ??
  list.find((c) => norm(name) && (norm(c.title).includes(norm(name)) || norm(name).includes(norm(c.title))));

/** Flatten search results (any shelf layout) into normalised items. */
async function searchItems(query: string, type?: 'artist' | 'album' | 'song'): Promise<Item[]> {
  const res: any = await api().search(query, type ? ({ type } as any) : undefined);
  const out: Item[] = [];
  for (const sec of res.contents ?? []) out.push(...items(sec.contents));
  return out;
}

/** Find an artist's browse id from their name. */
export async function findArtistId(name: string): Promise<string | null> {
  for (const type of ['artist', undefined] as const) {
    try {
      const found = (await searchItems(name, type)).filter((i): i is Collection => i.kind === 'artist');
      const best = pickByName(found, name);
      if (best) return best.id;
    } catch { /* try the next strategy */ }
  }
  return null;
}

/**
 * Find an album's browse id. Uses the album name when known; otherwise finds the song
 * and takes the album it belongs to.
 */
export async function findAlbumId(album: string, artist = '', song = ''): Promise<string | null> {
  if (album) {
    try {
      const found = (await searchItems(`${album} ${artist}`.trim(), 'album')).filter((i): i is Collection => i.kind === 'album');
      const best = pickByName(found, album);
      if (best) return best.id;
    } catch { /* fall through to song lookup */ }
  }
  if (song) {
    try {
      const tracks = (await searchItems(`${song} ${artist}`.trim(), 'song')).filter((i): i is Track => i.kind === 'track');
      const best = tracks.find((t) => norm(t.title) === norm(song) && t.albumId) ?? tracks.find((t) => t.albumId);
      if (best?.albumId) return best.albumId;
    } catch { /* nothing more to try */ }
  }
  return null;
}

async function nextResponse(videoId: string, listId = ''): Promise<any> {
  if (!yt) throw new Error('Not connected');
  return yt.actions.execute('/next', {
    videoId,
    ...(listId ? { playlistId: listId } : {}),
    client: 'YTMUSIC',
    parse: true,
  } as any);
}

export interface QueueItem {
  track: Track;
  /** True for the song that is playing now. */
  current: boolean;
}

/**
 * What YouTube Music will play after `videoId`. Pass the playlist the song was started from
 * (if any) so the queue matches it; with no playlist this is the song's radio.
 */
export async function queue(videoId: string, listId = ''): Promise<QueueItem[]> {
  const res = await nextResponse(videoId, listId);
  const panel: any = res?.contents_memo?.get('PlaylistPanel')?.[0];
  if (!panel) throw new Error('YouTube Music returned no queue for this song');

  const out: QueueItem[] = [];
  for (const node of panel.contents ?? []) {
    const v: any = node?.primary ?? node; // some entries wrap the song with its video counterpart
    if (!v?.video_id) continue;
    const artists = (v.artists ?? []).filter((a: any) => a?.name);
    out.push({
      current: !!v.selected || v.video_id === videoId,
      track: {
        kind: 'track',
        id: v.video_id,
        title: text(v.title),
        artist: artists.map((a: any) => a.name).join(', ') || v.author || '',
        artists: artists.map((a: any) => ({ name: a.name, id: a.channel_id ?? '' })).filter((a: Artist) => a.id),
        album: v.album?.name,
        albumId: v.album?.id,
        duration: v.duration?.seconds,
        thumb: thumb(v.thumbnail),
      },
    });
  }
  return out;
}

// ---------- likes and dislikes ----------

const signedIn = () => {
  if (!yt) throw new Error('Not connected');
  return yt;
};

export type Rating = 'LIKE' | 'DISLIKE' | 'INDIFFERENT';

const ratings = new Map<string, Rating>();
const ratingListeners = new Set<(videoId: string, rating: Rating) => void>();

export const cachedRating = (videoId: string) => ratings.get(videoId);

/** Be told whenever a song's rating changes (from the player bar, a menu, anywhere). */
export function onRatingChange(fn: (videoId: string, rating: Rating) => void) {
  ratingListeners.add(fn);
  return () => { ratingListeners.delete(fn); };
}

/** Whether you've liked or disliked a song. Only remembers answers YouTube Music actually gave. */
export async function likeStatus(videoId: string): Promise<Rating> {
  const hit = ratings.get(videoId);
  if (hit) return hit;
  const res = await nextResponse(videoId);
  const buttons: any[] = res?.contents_memo?.get('LikeButton') ?? [];
  const mine = buttons.find((b) => (b.target?.video_id ?? b.target?.videoId) === videoId) ?? buttons[0];
  if (!mine) return 'INDIFFERENT';
  const raw = String(mine.like_status ?? '').toUpperCase();
  const rating: Rating = raw === 'LIKE' || raw === 'DISLIKE' ? raw : 'INDIFFERENT';
  ratings.set(videoId, rating);
  return rating;
}

/**
 * Turn a failed request into something readable. The library puts YouTube's own response
 * in `info`, which usually says what was wrong.
 */
export function describeError(e: unknown): string {
  const err = e as { message?: string; info?: unknown };
  const base = String(err?.message ?? e);
  let info: unknown = err?.info;
  if (typeof info === 'string') {
    try { info = JSON.parse(info)?.error?.message ?? info; } catch { /* keep the raw text */ }
  }
  const detail = typeof info === 'string' ? info.trim().slice(0, 200) : '';
  return detail ? `${base} (${detail})` : base;
}

const RATING_PATH: Record<Rating, string> = { LIKE: '/like/like', DISLIKE: '/like/dislike', INDIFFERENT: '/like/removelike' };

/**
 * Send a rating ourselves. The library's built-in like helper uses the TV client and a bare-string
 * target, which YouTube rejects (400) when signed in with browser cookies. This is the request
 * the web player makes: the web client and `target: { videoId }`.
 */
async function sendRating(videoId: string, rating: Rating): Promise<void> {
  const session = signedIn();
  let lastError: unknown;
  for (const client of ['WEB', 'YTMUSIC'] as const) {
    try {
      await session.actions.execute(RATING_PATH[rating] as any, { client, target: { videoId } } as any);
      return;
    } catch (e) {
      lastError = e; // try the other client before giving up
    }
  }
  throw lastError;
}

export async function setRating(videoId: string, rating: Rating): Promise<void> {
  await sendRating(videoId, rating);
  ratings.set(videoId, rating);
  pageCache.delete('pl:LM'); // Liked Music has changed
  ratingListeners.forEach((fn) => fn(videoId, rating));
}

// ---------- playlist editing ----------

/** Drop cached copies of a playlist so the next visit shows the change. */
function forgetPlaylist(listId: string) {
  const bare = playlistIdOf(listId);
  for (const key of [...pageCache.keys()]) if (key.endsWith(bare)) pageCache.delete(key);
}

export async function createPlaylist(title: string, videoIds: string[] = []): Promise<string> {
  const res = await signedIn().playlist.create(title, videoIds);
  if (!res.success || !res.playlist_id) throw new Error('YouTube Music did not create the playlist');
  return res.playlist_id;
}

export async function addToPlaylist(listId: string, videoId: string): Promise<void> {
  await signedIn().playlist.addVideos(playlistIdOf(listId), [videoId]);
  forgetPlaylist(listId);
}

export async function removeFromPlaylist(listId: string, videoId: string): Promise<void> {
  await signedIn().playlist.removeVideos(playlistIdOf(listId), [videoId]);
  forgetPlaylist(listId);
}

export async function renamePlaylist(listId: string, name: string): Promise<void> {
  await signedIn().playlist.setName(playlistIdOf(listId), name);
  forgetPlaylist(listId);
}

export async function deletePlaylist(listId: string): Promise<void> {
  await signedIn().playlist.delete(playlistIdOf(listId));
  forgetPlaylist(listId);
}

// ---------- search suggestions ----------

/** What YouTube Music suggests as you type. */
export async function searchSuggestions(query: string): Promise<string[]> {
  const sections: any = await api().getSearchSuggestions(query);
  const out: string[] = [];
  for (const section of sections ?? []) {
    for (const entry of section.contents ?? []) {
      const suggestion = text(entry.suggestion);
      if (suggestion && !out.includes(suggestion)) out.push(suggestion);
    }
  }
  return out.slice(0, 8);
}

// ---------- library tabs ----------

/** The library's own filter names (e.g. Playlists, Songs, Albums, Artists), as YouTube Music words them. */
export async function libraryFilters(): Promise<string[]> {
  const lib: any = await api().getLibrary();
  return (lib.filters ?? []).map((f: unknown) => String(f));
}

/** One tab of the library. The default tab is Playlists; the others apply YouTube Music's filter. */
export async function libraryTab(tab: string, max = 150): Promise<Item[]> {
  let lib: any = await api().getLibrary();
  if (!/^playlists?$/i.test(tab)) lib = await lib.applyFilter(tab);
  const out: Item[] = [];
  const collect = (sections: any[] | undefined) => {
    for (const section of sections ?? []) out.push(...items(section.items ?? section.contents));
  };
  collect(lib.contents);
  for (let n = 0; n < 8 && lib.has_continuation && out.length < max; n++) {
    lib = await lib.getContinuation();
    collect(lib.contents ? [lib.contents] : []);
  }
  return out;
}

// ---------- explore and other browse pages ----------

/** A button that opens another browse page (e.g. "Charts", or a mood like "Chill"). */
export interface BrowseButton { label: string; browseId: string; params?: string }

export interface BrowsePage { shelves: Shelf[]; buttons: BrowseButton[] }

const buttonOf = (b: any): BrowseButton | null => {
  const payload = b?.endpoint?.payload;
  const label = String(b?.button_text ?? '').trim();
  return label && payload?.browseId ? { label, browseId: payload.browseId, params: payload.params } : null;
};

const dedupeButtons = (list: (BrowseButton | null)[]): BrowseButton[] => {
  const seen = new Set<string>();
  const out: BrowseButton[] = [];
  for (const b of list) {
    if (!b) continue;
    const key = `${b.browseId}|${b.params ?? ''}|${b.label}`;
    if (!seen.has(key)) { seen.add(key); out.push(b); }
  }
  return out;
};

const shelfOf = (node: any, title: string): Shelf => ({ title, items: items(node?.contents) });

/**
 * The Explore page (new releases, charts, moods) and the pages its buttons lead to.
 * Explore itself uses the library's own method; the rest read whatever shelves and buttons a page contains.
 */
export async function browsePage(browseId: string, params?: string): Promise<BrowsePage> {
  if (browseId === 'FEmusic_explore') {
    const explore: any = await api().getExplore();
    return {
      buttons: dedupeButtons((explore.top_buttons ?? []).map(buttonOf)),
      shelves: (explore.sections ?? []).map((n: any) => shelfOf(n, text(n.header?.title))).filter((sh: Shelf) => sh.items.length),
    };
  }
  if (!yt) throw new Error('Not connected');
  const res: any = await yt.actions.execute('/browse', {
    browseId,
    ...(params ? { params } : {}),
    client: 'YTMUSIC',
    parse: true,
  } as any);
  const memo = res?.contents_memo;
  const shelves: Shelf[] = [
    ...(memo?.get('MusicCarouselShelf') ?? []).map((n: any) => shelfOf(n, text(n.header?.title))),
    ...(memo?.get('MusicShelf') ?? []).map((n: any) => shelfOf(n, text(n.title))),
  ].filter((sh: Shelf) => sh.items.length);
  return { shelves, buttons: dedupeButtons((memo?.get('MusicNavigationButton') ?? []).map(buttonOf)) };
}
