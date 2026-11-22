import { useEffect, useRef, useState, type ReactNode } from 'react';
import { hiRes } from '../lib/ytm';
import type { Artist, Collection, Item, Shelf, Track } from '../types';
import { More, Play } from './Icons';

/** Tries the upscaled image first, then the original URL, then falls back to a plain tile. */
export function Cover({ src, className = '' }: { src: string; className?: string }) {
  const [attempt, setAttempt] = useState(0);
  useEffect(() => setAttempt(0), [src]);
  if (!src || attempt > 1) return <div className={`cover ${className}`} />;
  return (
    <img
      className={`cover ${className}`}
      src={attempt === 0 ? hiRes(src, 400) : src}
      alt=""
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setAttempt((a) => a + 1)}
    />
  );
}

/** Inline clickable text (a span, so it can live inside buttons and rows). */
export function Link({ onGo, title, children }: { onGo?: () => void; title?: string; children: ReactNode }) {
  if (!onGo) return <>{children}</>;
  return (
    <span
      className="link" role="link" tabIndex={0} title={title}
      onClick={(e) => { e.stopPropagation(); onGo(); }}
      onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onGo(); } }}
    >{children}</span>
  );
}

/**
 * "Artist A, Artist B", each name a link. Names with a known id open directly;
 * the rest are looked up by name when clicked.
 */
export function ArtistLinks({ artists, fallback, onArtist }: { artists?: Artist[]; fallback: string; onArtist?: (id: string, name?: string) => void }) {
  if (!onArtist) return <>{fallback}</>;
  const list: Artist[] = artists?.length
    ? artists
    : fallback.split(', ').map((n) => n.trim()).filter(Boolean).map((name) => ({ name, id: '' }));
  return (
    <>
      {list.map((a, i) => (
        <span key={`${a.id}-${a.name}-${i}`}>
          {i > 0 && ', '}
          <Link onGo={() => onArtist(a.id, a.name)} title={`Go to ${a.name}`}>{a.name}</Link>
        </span>
      ))}
    </>
  );
}

export function Card({ item, onOpen, onPlay }: { item: Item; onOpen: (c: Collection) => void; onPlay: (t: Track) => void }) {
  const isTrack = item.kind === 'track';
  const sub = isTrack ? item.artist : item.subtitle;
  return (
    <button className={`card ${item.kind === 'artist' ? 'artist' : ''}`} onClick={() => (isTrack ? onPlay(item) : onOpen(item))}>
      <div className="card-art">
        <Cover src={item.thumb} />
        <span className="card-play"><Play size={22} /></span>
      </div>
      <div className="card-title" title={item.title}>{item.title}</div>
      <div className="card-sub">{sub}</div>
    </button>
  );
}

export function ShelfRow({ shelf, onOpen, onPlay }: { shelf: Shelf; onOpen: (c: Collection) => void; onPlay: (t: Track) => void }) {
  return (
    <section className="shelf">
      <h2>{shelf.title}</h2>
      <div className="shelf-row">
        {shelf.items.map((it, i) => (
          <Card key={`${it.id}-${i}`} item={it} onOpen={onOpen} onPlay={onPlay} />
        ))}
      </div>
    </section>
  );
}

const fmt = (s?: number) => (s ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}` : '');

export function TrackList({
  tracks, current, onPlay, onArtist, onAlbum, onMenu,
}: {
  tracks: Track[];
  current: string;
  onPlay: (t: Track, i: number) => void;
  /** Opens the song menu at a screen position (right-click or the "more" button). */
  onMenu?: (t: Track, x: number, y: number) => void;
  onArtist?: (id: string, name?: string) => void;
  onAlbum?: (id: string, album: string, artist?: string, song?: string) => void;
}) {
  // Only draw rows near the viewport: a 2,000-song playlist would otherwise create thousands of images at once.
  const [shown, setShown] = useState(80);
  const sentinel = useRef<HTMLDivElement>(null);
  const hasMore = tracks.length > shown;
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0].isIntersecting) setShown((n) => n + 80); }, { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, shown]);

  return (
    <div className="tracks">
      {tracks.slice(0, shown).map((t, i) => (
        <div
          key={`${t.id}-${i}`}
          className={`track ${t.id === current ? 'is-current' : ''} ${onMenu ? 'has-menu' : ''}`}
          role="button" tabIndex={0}
          onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu(t, e.clientX, e.clientY); } : undefined}
          onClick={() => onPlay(t, i)}
          onKeyDown={(e) => { if (e.key === 'Enter') onPlay(t, i); }}
        >
          <span className="track-n">{t.id === current ? <Play size={16} /> : i + 1}</span>
          <Cover src={t.thumb} className="track-art" />
          <span className="track-main">
            <span className="track-title">{t.title}</span>
            <span className="track-artist"><ArtistLinks artists={t.artists} fallback={t.artist} onArtist={onArtist} /></span>
          </span>
          <span className="track-album">
            {t.album && onAlbum
              ? <Link onGo={() => onAlbum(t.albumId ?? '', t.album!, t.artist, t.title)} title="Go to album">{t.album}</Link>
              : t.album}
          </span>
          <span className="track-time">{fmt(t.duration)}</span>
          {onMenu && (
            <button
              className="track-more" aria-label={`More actions for ${t.title}`} title="More"
              onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onMenu(t, r.left, r.bottom + 4); }}
            ><More /></button>
          )}
        </div>
      ))}
      {hasMore && <div ref={sentinel} style={{ height: 1 }} />}
    </div>
  );
}
