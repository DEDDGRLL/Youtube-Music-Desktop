import { useEffect, useRef, useState } from 'react';
import { getLyrics, type Lyrics as L } from '../lib/lyrics';
import { player, usePlayerSel } from '../lib/player';

/**
 * Lyrics for the current song. Synced lines follow playback (click one to seek).
 * When there are no lyrics to show, the album artwork fills the space instead.
 */
export default function LyricsPane({ onAvailable }: { onAvailable?: (has: boolean) => void }) {
  const videoId = usePlayerSel((s) => s.videoId);
  const title = usePlayerSel((s) => s.title);
  const artist = usePlayerSel((s) => s.artist);
  const hasDuration = usePlayerSel((s) => s.duration > 0);
  const duration = usePlayerSel((s) => Math.round(s.duration));
  const position = usePlayerSel((s) => s.position);

  const [lyrics, setLyrics] = useState<L | null>(null);
  const [source, setSource] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'none' | 'error'>('idle');
  const [detail, setDetail] = useState('');
  const active = useRef<HTMLButtonElement | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!videoId || !title) return;
    let stale = false;
    setStatus('loading');
    setLyrics(null);
    getLyrics(videoId, title, artist, duration).then((r) => {
      if (stale) return;
      setLyrics(r.lyrics);
      setSource(r.source ?? '');
      setDetail(r.error ?? '');
      setStatus(r.lyrics ? 'idle' : r.error ? 'error' : 'none');
    });
    return () => { stale = true; };
    // Re-run once the real duration arrives (it improves matching); not on every tick.
  }, [videoId, title, artist, hasDuration]); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = lyrics?.synced ?? null;
  const has = !!(lines || lyrics?.plain);
  useEffect(() => { onAvailable?.(has); }, [has]); // eslint-disable-line react-hooks/exhaustive-deps
  let idx = -1;
  if (lines) for (let i = 0; i < lines.length && lines[i].t <= position + 0.25; i++) idx = i;

  // Keep the current line centred by scrolling only our own container.
  useEffect(() => {
    const box = scroller.current;
    const el = active.current;
    if (!box || !el) return;
    box.scrollTo({ top: el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2, behavior: 'smooth' });
  }, [idx]);

  // Nothing to read yet: just a short status line (the viewer centres the artwork instead).
  if (!has) {
    const note =
      !videoId ? 'Play a song to see its lyrics.'
      : status === 'loading' ? 'Looking up lyrics…'
      : status === 'error' ? `Couldn’t reach the lyrics service (${detail}).`
      : `No lyrics found for “${title}” by ${artist}.`;
    return <p className="lyrics-note solo-note">{note}</p>;
  }

  return (
    <div className="lyrics-scroll" ref={scroller}>
    <div className={`lyrics-pane ${lines ? 'synced' : ''}`}>
      {lines?.map((l, i) => (
        <button
          key={i}
          ref={i === idx ? active : null}
          className={`line ${i === idx ? 'current' : i < idx ? 'past' : ''}`}
          onClick={() => player.seek(l.t)}
        >
          {l.text || '♪'}
        </button>
      ))}
      {!lines && lyrics?.plain && <pre className="lyrics-plain">{lyrics.plain}</pre>}
      <p className="lyrics-note small">{lines ? 'Synced' : 'Not time-synced'} · {source}</p>
    </div>
    </div>
  );
}
