import { useEffect, useState } from 'react';
import { player, usePlayerSel } from '../lib/player';
import * as ytm from '../lib/ytm';
import { ArtistLinks, Cover } from './Cards';
import { Close } from './Icons';

const fmt = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

/** Slide-in list of what plays next. Click a song to jump to it. */
export default function QueuePanel({ onClose, onArtist }: { onClose: () => void; onArtist: (id: string, name?: string) => void }) {
  const videoId = usePlayerSel((s) => s.videoId);
  const listId = usePlayerSel((s) => s.listId);
  const shuffle = usePlayerSel((s) => s.shuffle);
  const [items, setItems] = useState<ytm.QueueItem[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!videoId) { setItems([]); return; }
    let stale = false;
    setError('');
    ytm.queue(videoId, listId)
      .then((r) => { if (!stale) setItems(r); })
      .catch((e) => { if (!stale) { setError(String(e?.message ?? e)); setItems([]); } });
    return () => { stale = true; };
  }, [videoId, listId]);

  // Esc closes the queue first, without also closing the Now Playing view underneath.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const currentAt = items ? items.findIndex((i) => i.current) : -1;
  const now = currentAt >= 0 ? items![currentAt] : null;
  const upNext = items ? (currentAt >= 0 ? items.slice(currentAt + 1) : items) : [];

  const row = (it: ytm.QueueItem, key: string) => (
    <div
      key={key} className={`q-item ${it.current ? 'is-current' : ''}`} role="button" tabIndex={0}
      onClick={() => player.load(it.track, listId || undefined)}
      onKeyDown={(e) => { if (e.key === 'Enter') player.load(it.track, listId || undefined); }}
    >
      <Cover src={it.track.thumb} className="q-art" />
      <span className="q-text">
        <span className="q-title">{it.track.title}</span>
        <span className="q-artist"><ArtistLinks artists={it.track.artists} fallback={it.track.artist} onArtist={onArtist} /></span>
      </span>
      <span className="q-time">{fmt(it.track.duration)}</span>
    </div>
  );

  return (
    <aside className="queue" aria-label="Queue">
      <header className="queue-head">
        <h2>Queue</h2>
        <button className="icon" onClick={onClose} aria-label="Close queue" title="Close (Esc)"><Close /></button>
      </header>
      <div className="queue-body">
        {shuffle && <p className="queue-note">Shuffle is on, so the real play order may differ from this list.</p>}
        {!videoId && <p className="muted queue-note">Play a song to see what's coming up.</p>}
        {videoId && !items && <p className="muted queue-note">Loading the queue…</p>}
        {error && <p className="error queue-note" role="alert">Couldn’t load the queue: {error}</p>}
        {now && (
          <>
            <h3>Now playing</h3>
            {row(now, `now-${now.track.id}`)}
          </>
        )}
        {upNext.length > 0 && (
          <>
            <h3>Next up</h3>
            {upNext.map((it, i) => row(it, `${it.track.id}-${i}`))}
          </>
        )}
        {items && !error && items.length > 0 && upNext.length === 0 && <p className="muted queue-note">That's the end of the queue.</p>}
      </div>
    </aside>
  );
}
