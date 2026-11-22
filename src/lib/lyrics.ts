import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { plainLyrics } from './ytm';

export interface Line { t: number; text: string }
export interface Lyrics { synced: Line[] | null; plain: string | null }
export interface LyricsResult { lyrics: Lyrics | null; error?: string; source?: string }

// LRCLIB asks clients to identify themselves.
const HEADERS = { 'User-Agent': 'YTMusicDesktop/0.1 (https://github.com/DEDDGRLL/Youtube-Music-Desktop)' };
const cache = new Map<string, LyricsResult>();

export function parseLrc(lrc: string): Line[] {
  const out: Line[] = [];
  for (const raw of lrc.split('\n')) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const m of stamps) out.push({ t: Number(m[1]) * 60 + Number(m[2]), text });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** "Song (feat. X) - Remastered 2011" -> "Song" */
const clean = (s: string) => s.replace(/\s*[(\[].*?[)\]]/g, '').replace(/\s+-\s+.*$/, '').trim();
const firstArtist = (s: string) => s.split(/,|&|\bx\b|feat\.|ft\./i)[0].trim();

function shape(r: any): Lyrics | null {
  if (!r) return null;
  const synced = r.syncedLyrics ? parseLrc(r.syncedLyrics) : null;
  if (!synced?.length && !r.plainLyrics) return null;
  return { synced: synced?.length ? synced : null, plain: r.plainLyrics ?? null };
}

async function search(params: Record<string, string>): Promise<any[]> {
  const res = await tauriFetch(`https://lrclib.net/api/search?${new URLSearchParams(params)}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`LRCLIB responded ${res.status}`);
  const list = await res.json();
  return Array.isArray(list) ? list : [];
}

/** Best match: synced + close duration > synced > anything with lyrics. */
function pick(list: any[], duration: number) {
  const close = (r: any) => !duration || Math.abs((r.duration ?? 0) - duration) <= 4;
  return (
    list.find((r) => r.syncedLyrics && close(r)) ??
    list.find((r) => r.syncedLyrics) ??
    list.find((r) => r.plainLyrics && close(r)) ??
    list.find((r) => r.plainLyrics)
  );
}

/**
 * Find lyrics: LRCLIB first (time-synced, via progressively looser searches),
 * then YouTube Music's own plain-text lyrics as a fallback.
 */
export async function getLyrics(videoId: string, title: string, artist: string, duration: number): Promise<LyricsResult> {
  const key = `${videoId}|${title}|${artist}|${Math.round(duration)}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const a = firstArtist(artist);
  const t = clean(title) || title;
  const attempts: Record<string, string>[] = [
    { track_name: title, artist_name: a },
    { track_name: t, artist_name: a },
    { q: `${t} ${a}` },
    { q: t },
  ];

  let found: Lyrics | null = null;
  let lastError: string | undefined;
  for (const params of attempts) {
    try {
      found = shape(pick(await search(params), duration));
      if (found) break;
    } catch (e: any) {
      lastError = String(e?.message ?? e);
    }
  }

  let result: LyricsResult = found ? { lyrics: found, source: 'LRCLIB' } : { lyrics: null };
  if (!found?.synced && videoId) {
    const plain = await plainLyrics(videoId);
    if (plain && !found) result = { lyrics: { synced: null, plain }, source: 'YouTube Music' };
  }
  if (!result.lyrics && lastError) result = { lyrics: null, error: lastError };
  if (!result.error) cache.set(key, result);
  return result;
}
