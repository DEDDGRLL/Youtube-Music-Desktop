/**
 * Decides when a song counts as "listened to". Pure logic (no storage or network), so it can be tested.
 *
 * The usual rule (the same one Last.fm and ListenBrainz use): the song is longer than 30 seconds, and you
 * played it for at least half its length or 4 minutes, whichever comes first. Time is counted while it is
 * actually playing, so seeking around, pausing, or ads can't inflate or deflate a count.
 */

export interface TrackInfo {
  id: string;
  title: string;
  artist: string;
  artists: string[];
  album: string;
  thumb: string;
  duration: number;
}

export interface Listen extends TrackInfo {
  /** When the song started, in milliseconds since 1970. */
  ts: number;
  /** Seconds actually played. */
  played: number;
}

export type TrackerEvent =
  | { type: 'playing'; track: TrackInfo }
  | { type: 'listen'; listen: Listen };

export interface PlayerSnapshot {
  videoId: string;
  title: string;
  artist: string;
  artists: { name: string }[];
  albumName: string;
  thumb: string;
  duration: number;
  position: number;
  playing: boolean;
  ad: boolean;
}

interface Current extends TrackInfo { startedAt: number; played: number; counted: boolean; announced: boolean }

/** Gaps longer than this between updates aren't counted as playing time (e.g. the app was asleep). */
const MAX_GAP_MS = 1500;
const MIN_SONG_SECONDS = 30;
const MAX_NEEDED_SECONDS = 240;
/** How long a song plays before it is announced as "now playing". */
const ANNOUNCE_AFTER_SECONDS = 5;

export const neededSeconds = (duration: number) => Math.min(duration / 2, MAX_NEEDED_SECONDS);

export class ListenTracker {
  private cur: Current | null = null;
  private lastAt = 0;
  private lastPosition = 0;

  /** Feed every player update. Returns anything that just happened. */
  feed(s: PlayerSnapshot, now: number): TrackerEvent[] {
    const gap = this.lastAt ? now - this.lastAt : 0;
    this.lastAt = now;
    if (s.ad || !s.videoId || !s.title) return [];

    // A different song, or the same song starting over (repeat one) after it had been listened to.
    const startedOver = !!this.cur && this.cur.id === s.videoId && this.cur.counted && s.position < 5 && this.lastPosition > Math.max(30, this.cur.duration * 0.5);
    if (!this.cur || this.cur.id !== s.videoId || startedOver) {
      this.cur = { id: s.videoId, title: '', artist: '', artists: [], album: '', thumb: '', duration: 0, startedAt: now, played: 0, counted: false, announced: false };
    }
    this.lastPosition = s.position;

    // Details arrive a moment after a song starts, so keep them fresh while it plays.
    const c = this.cur;
    c.title = s.title;
    c.artist = s.artist;
    c.artists = s.artists.length ? s.artists.map((a) => a.name) : s.artist ? s.artist.split(', ').filter(Boolean) : [];
    c.album = s.albumName;
    c.thumb = s.thumb;
    c.duration = s.duration || c.duration;

    if (s.playing) c.played += Math.min(gap, MAX_GAP_MS) / 1000;

    const events: TrackerEvent[] = [];
    if (!c.announced && c.played >= ANNOUNCE_AFTER_SECONDS) {
      c.announced = true;
      events.push({ type: 'playing', track: this.info(c) });
    }
    if (!c.counted && c.duration >= MIN_SONG_SECONDS && c.played >= neededSeconds(c.duration)) {
      c.counted = true;
      events.push({ type: 'listen', listen: { ...this.info(c), ts: c.startedAt, played: Math.round(c.played) } });
    }
    return events;
  }

  private info(c: Current): TrackInfo {
    return { id: c.id, title: c.title, artist: c.artist, artists: c.artists, album: c.album, thumb: c.thumb, duration: c.duration };
  }
}
