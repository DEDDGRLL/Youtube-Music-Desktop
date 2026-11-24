import { useEffect, useMemo, useState } from 'react';
import { clearListens, listensSince, recentListens } from '../lib/listens';
import { prefs } from '../lib/listening';
import { player, usePlayerSel } from '../lib/player';
import { formatDuration, RANGES, rangeStart, summarize, timeAgo, type Range } from '../lib/stats';
import type { Listen } from '../lib/tracker';
import { notify } from '../lib/ui';
import type { Track } from '../types';
import { Cover, Link } from './Cards';

type Tab = 'stats' | 'recent';

const toTrack = (l: { id: string; title: string; artist: string; thumb: string }): Track =>
  ({ kind: 'track', id: l.id, title: l.title, artist: l.artist, artists: [], thumb: l.thumb });

const csv = (rows: Listen[]) => {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  return ['started,title,artist,album,video_id,length_seconds,played_seconds',
    ...rows.map((l) => [new Date(l.ts).toISOString(), l.title, l.artist, l.album, l.id, Math.round(l.duration), l.played].map(q).join(','))].join('\n');
};

function Tile({ value, label }: { value: string; label: string }) {
  return <div className="tile"><div className="tile-value">{value}</div><div className="tile-label">{label}</div></div>;
}

/** Your listening history: top songs and artists for a period, and what you played recently. */
export default function StatsView({ onArtist }: { onArtist: (id: string, name?: string) => void }) {
  const [tab, setTab] = useState<Tab>('stats');
  const [range, setRange] = useState<Range>('month');
  const [listens, setListens] = useState<Listen[] | null>(null);
  const [recent, setRecent] = useState<Listen[] | null>(null);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [version, setVersion] = useState(0);
  const current = usePlayerSel((s) => s.videoId);

  useEffect(() => {
    let stale = false;
    setListens(null);
    listensSince(rangeStart(range)).then((r) => { if (!stale) setListens(r); }).catch((e) => { if (!stale) setError(String(e?.message ?? e)); });
    return () => { stale = true; };
  }, [range, version]);

  useEffect(() => {
    if (tab !== 'recent') return;
    let stale = false;
    recentListens(100).then((r) => { if (!stale) setRecent(r); }).catch((e) => { if (!stale) setError(String(e?.message ?? e)); });
    return () => { stale = true; };
  }, [tab, version]);

  const summary = useMemo(() => (listens ? summarize(listens) : null), [listens]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(csv(await listensSince(0)));
      notify('Your history was copied as CSV. Paste it into a spreadsheet.');
    } catch { notify('Couldn’t copy the history.'); }
  };
  const clear = async () => {
    if (!confirming) { setConfirming(true); return; }
    await clearListens();
    setConfirming(false);
    setVersion((v) => v + 1);
    notify('Listening history cleared.');
  };

  const empty = (
    <p className="muted">
      {prefs.historyOn()
        ? 'Nothing here yet. Songs show up after you’ve listened to at least half of them (or 4 minutes).'
        : 'The listening history is turned off. You can turn it on in Settings.'}
    </p>
  );

  return (
    <div className="stats">
      <h1>Listening history</h1>
      <div className="chips" role="group" aria-label="View">
        <button className="chip" aria-pressed={tab === 'stats'} onClick={() => setTab('stats')}>Stats</button>
        <button className="chip" aria-pressed={tab === 'recent'} onClick={() => setTab('recent')}>Recent plays</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}

      {tab === 'stats' && (
        <>
          <div className="chips" role="group" aria-label="Time period">
            {RANGES.map((r) => <button key={r.type} className="chip" aria-pressed={range === r.type} onClick={() => setRange(r.type)}>{r.label}</button>)}
          </div>
          {!summary ? <p className="muted">Loading…</p> : summary.total === 0 ? empty : (
            <>
              <div className="tiles">
                <Tile value={summary.total.toLocaleString()} label="Plays" />
                <Tile value={formatDuration(summary.seconds)} label="Time listened" />
                <Tile value={summary.songs.toLocaleString()} label="Different songs" />
                <Tile value={summary.artists.toLocaleString()} label="Different artists" />
              </div>
              <div className="stat-cols">
                <section>
                  <h2>Top songs</h2>
                  {summary.topSongs.map((s, i) => (
                    <div key={s.id} className={`stat-row ${s.id === current ? 'is-current' : ''}`} role="button" tabIndex={0}
                      onClick={() => player.load(toTrack(s))} onKeyDown={(e) => { if (e.key === 'Enter') player.load(toTrack(s)); }}>
                      <span className="stat-rank">{i + 1}</span>
                      <Cover src={s.thumb} className="stat-art" />
                      <span className="stat-text"><span className="stat-title">{s.title}</span><span className="stat-sub">{s.artist}</span></span>
                      <span className="stat-count">{s.count} {s.count === 1 ? 'play' : 'plays'}</span>
                    </div>
                  ))}
                </section>
                <section>
                  <h2>Top artists</h2>
                  {summary.topArtists.map((a, i) => (
                    <div key={a.name} className="stat-row artist" role="button" tabIndex={0}
                      onClick={() => onArtist('', a.name)} onKeyDown={(e) => { if (e.key === 'Enter') onArtist('', a.name); }}>
                      <span className="stat-rank">{i + 1}</span>
                      <span className="stat-text"><span className="stat-title">{a.name}</span></span>
                      <span className="stat-count">{a.count} {a.count === 1 ? 'play' : 'plays'}</span>
                    </div>
                  ))}
                </section>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'recent' && (!recent ? <p className="muted">Loading…</p> : recent.length === 0 ? empty : (
        <div className="stat-list">
          {recent.map((l, i) => (
            <div key={`${l.id}-${l.ts}-${i}`} className={`stat-row ${l.id === current ? 'is-current' : ''}`} role="button" tabIndex={0}
              onClick={() => player.load(toTrack(l))} onKeyDown={(e) => { if (e.key === 'Enter') player.load(toTrack(l)); }}>
              <Cover src={l.thumb} className="stat-art" />
              <span className="stat-text">
                <span className="stat-title">{l.title}</span>
                <span className="stat-sub"><Link onGo={() => onArtist('', l.artists[0] ?? l.artist)} title={`Go to ${l.artist}`}>{l.artist}</Link></span>
              </span>
              <span className="stat-count">{timeAgo(l.ts)}</span>
            </div>
          ))}
        </div>
      ))}

      <div className="stat-actions">
        <button className="ghost small-ghost" onClick={copy}>Copy as CSV</button>
        <button className={`ghost small-ghost ${confirming ? 'danger' : ''}`} onClick={clear} onBlur={() => setConfirming(false)}>
          {confirming ? 'Click again to clear everything' : 'Clear history'}
        </button>
      </div>
    </div>
  );
}
