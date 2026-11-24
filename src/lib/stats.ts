import type { Listen } from './tracker';

export type Range = 'week' | 'month' | 'year' | 'all';

export const RANGES: { type: Range; label: string }[] = [
  { type: 'week', label: 'Last 7 days' },
  { type: 'month', label: 'Last 30 days' },
  { type: 'year', label: 'Last year' },
  { type: 'all', label: 'All time' },
];

const DAY = 86_400_000;
export const rangeStart = (range: Range, now = Date.now()) =>
  range === 'all' ? 0 : now - (range === 'week' ? 7 : range === 'month' ? 30 : 365) * DAY;

export interface TopSong { id: string; title: string; artist: string; thumb: string; count: number }
export interface TopArtist { name: string; count: number }
export interface Summary {
  total: number;
  /** Seconds actually listened. */
  seconds: number;
  songs: number;
  artists: number;
  topSongs: TopSong[];
  topArtists: TopArtist[];
}

/** Counts and rankings for a set of listens. Ties go to whichever was played most recently. */
export function summarize(listens: Listen[], limit = 10): Summary {
  const songs = new Map<string, TopSong & { last: number }>();
  const artists = new Map<string, TopArtist & { last: number }>();
  let seconds = 0;

  for (const l of listens) {
    seconds += l.played;
    const s = songs.get(l.id) ?? { id: l.id, title: l.title, artist: l.artist, thumb: l.thumb, count: 0, last: 0 };
    s.count++;
    if (l.ts >= s.last) { s.last = l.ts; s.title = l.title; s.artist = l.artist; s.thumb = l.thumb || s.thumb; }
    songs.set(l.id, s);

    // A song with several artists counts for each of them.
    for (const name of new Set(l.artists.length ? l.artists : [l.artist])) {
      if (!name) continue;
      const key = name.toLowerCase();
      const a = artists.get(key) ?? { name, count: 0, last: 0 };
      a.count++;
      a.last = Math.max(a.last, l.ts);
      artists.set(key, a);
    }
  }

  const rank = <T extends { count: number; last: number }>(m: Map<string, T>) =>
    [...m.values()].sort((a, b) => b.count - a.count || b.last - a.last).slice(0, limit);

  return {
    total: listens.length,
    seconds,
    songs: songs.size,
    artists: artists.size,
    topSongs: rank(songs).map(({ last: _l, ...s }) => s),
    topArtists: rank(artists).map(({ last: _l, ...a }) => a),
  };
}

/** "3h 12m", "45m", "12s" */
export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function timeAgo(ts: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'yesterday' : `${d} days ago`;
}
