import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import type { Listen, TrackInfo } from './tracker';

const API = 'https://api.listenbrainz.org/1';
const CLIENT = 'Youtube Music for Desktop';

export type SendResult = 'ok' | 'unauthorized' | 'rejected' | 'retry';

function metadata(t: TrackInfo, version: string) {
  return {
    artist_name: t.artist || t.artists.join(', '),
    track_name: t.title,
    ...(t.album ? { release_name: t.album } : {}),
    additional_info: {
      media_player: CLIENT,
      submission_client: CLIENT,
      submission_client_version: version,
      music_service: 'youtube.com',
      origin_url: `https://music.youtube.com/watch?v=${t.id}`,
      ...(t.duration ? { duration_ms: Math.round(t.duration * 1000) } : {}),
    },
  };
}

/** Check a user token and find out whose it is. */
export async function validateToken(token: string): Promise<{ valid: boolean; user?: string; message: string }> {
  try {
    const res = await tauriFetch(`${API}/validate-token`, { headers: { Authorization: `Token ${token}` } });
    const body = await res.json();
    return body.valid
      ? { valid: true, user: String(body.user_name ?? ''), message: 'ok' }
      : { valid: false, message: String(body.message ?? 'That token is not valid.') };
  } catch (e) {
    return { valid: false, message: `Couldn’t reach ListenBrainz (${String((e as Error)?.message ?? e)}).` };
  }
}

async function send(token: string, type: 'single' | 'playing_now' | 'import', payload: unknown[]): Promise<SendResult> {
  try {
    const res = await tauriFetch(`${API}/submit-listens`, {
      method: 'POST',
      headers: { Authorization: `Token ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ listen_type: type, payload }),
    });
    if (res.ok) return 'ok';
    if (res.status === 401) return 'unauthorized';
    if (res.status === 400) return 'rejected'; // malformed: retrying would never help
    return 'retry'; // rate limit, server trouble
  } catch {
    return 'retry'; // offline
  }
}

/** Tell ListenBrainz what is playing right now (nothing is saved to your history). */
export const playingNow = (token: string, track: TrackInfo, version: string) =>
  send(token, 'playing_now', [{ track_metadata: metadata(track, version) }]);

/** Submit finished listens. */
export const submitListens = (token: string, listens: Listen[], version: string) =>
  send(token, listens.length > 1 ? 'import' : 'single',
    listens.map((l) => ({ listened_at: Math.floor(l.ts / 1000), track_metadata: metadata(l, version) })));
