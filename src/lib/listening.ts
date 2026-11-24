import { addListen } from './listens';
import { submitListens, playingNow } from './listenbrainz';
import { subscribeState } from './player';
import { ListenTracker, type Listen } from './tracker';
import { notify } from './ui';

/** Glue: watches playback, keeps the history, and sends listens to ListenBrainz when that is turned on. */

const K = { history: 'ytm-history-on', on: 'ytm-lb-on', token: 'ytm-lb-token', user: 'ytm-lb-user', queue: 'ytm-lb-queue' };
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* ignore */ } };

export const prefs = {
  /** On unless the user turned it off. */
  historyOn: () => get(K.history) !== '0',
  setHistoryOn: (on: boolean) => set(K.history, on ? '1' : '0'),
  token: () => get(K.token) ?? '',
  user: () => get(K.user) ?? '',
  scrobbleOn: () => get(K.on) === '1' && !!get(K.token),
  setScrobbleOn: (on: boolean) => set(K.on, on ? '1' : '0'),
  connect: (token: string, user: string) => { set(K.token, token); set(K.user, user); set(K.on, '1'); },
  disconnect: () => { set(K.token, null); set(K.user, null); set(K.on, '0'); set(K.queue, null); },
};

// ---- plays waiting to be sent (offline, or ListenBrainz was busy) ----
const MAX_QUEUE = 500;
const readQueue = (): Listen[] => { try { return JSON.parse(get(K.queue) ?? '[]'); } catch { return []; } };
const writeQueue = (q: Listen[]) => set(K.queue, JSON.stringify(q.slice(-MAX_QUEUE)));
export const pendingCount = () => readQueue().length;

let version = '';
let flushing = false;

/** Send what is waiting, a batch at a time. Stops at the first sign of trouble and tries again later. */
export async function flushQueue(): Promise<void> {
  if (flushing || !prefs.scrobbleOn()) return;
  flushing = true;
  try {
    for (;;) {
      const batch = readQueue().slice(0, 25);
      if (!batch.length) return;
      const result = await submitListens(prefs.token(), batch, version);
      if (result === 'ok' || result === 'rejected') {
        writeQueue(readQueue().slice(batch.length)); // rejected plays can never succeed, so don't keep them
      } else if (result === 'unauthorized') {
        prefs.setScrobbleOn(false);
        notify('ListenBrainz rejected your token, so sending plays has been turned off. Reconnect in Settings.');
        return;
      } else {
        return; // offline or busy: keep the queue
      }
    }
  } finally {
    flushing = false;
  }
}

/** Start watching playback. Call once, in the main window only. */
export function startListening(appVersion: string) {
  version = appVersion;
  const tracker = new ListenTracker();

  const stop = subscribeState((s) => {
    for (const event of tracker.feed(s, Date.now())) {
      if (event.type === 'playing') {
        if (prefs.scrobbleOn()) void playingNow(prefs.token(), event.track, version);
        continue;
      }
      if (prefs.historyOn()) addListen(event.listen).catch((e) => console.error('history', e));
      if (prefs.scrobbleOn()) {
        writeQueue([...readQueue(), event.listen]);
        void flushQueue();
      }
    }
  });

  const retry = setInterval(() => { if (pendingCount()) void flushQueue(); }, 60_000);
  void flushQueue();
  return () => { stop(); clearInterval(retry); };
}
