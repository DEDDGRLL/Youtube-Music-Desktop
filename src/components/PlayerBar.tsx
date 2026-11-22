import { useEffect, useState } from 'react';
import { player, usePlayerFull, windows } from '../lib/player';
import { artUrl, hiRes } from '../lib/ytm';
import { ArtistLinks, Link } from './Cards';
import RatingButtons from './RatingButtons';
import { Mic, Mini, Next, Pause, Play, Prev, Queue, Repeat, Shuffle, Volume } from './Icons';

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
// Check "none" first: the word NONE contains the letters ONE.
const repeatMode = (r: string) => {
  const u = r.toUpperCase();
  return u.includes('NONE') || u.includes('OFF') ? 'NONE' : u.includes('ONE') ? 'ONE' : u.includes('ALL') ? 'ALL' : 'NONE';
};
const nextRepeat = (r: string) => (r === 'NONE' ? 'ALL' : r === 'ALL' ? 'ONE' : 'NONE');

export default function PlayerBar({
  nowOpen, onToggleNow, queueOpen, onToggleQueue, onArtist, onAlbum,
}: {
  nowOpen: boolean;
  onToggleNow: () => void;
  queueOpen: boolean;
  onToggleQueue: () => void;
  onArtist: (id: string, name?: string) => void;
  onAlbum: (id: string, album: string, artist?: string, song?: string) => void;
}) {
  const s = usePlayerFull();
  const [drag, setDrag] = useState<number | null>(null);

  // Local copies so controls respond instantly; they re-sync whenever the player reports a change.
  const [vol, setVol] = useState(s.volume);
  const [shuffle, setShuffle] = useState(s.shuffle);
  const [repeat, setRepeat] = useState(repeatMode(s.repeat));
  useEffect(() => setVol(s.volume), [s.volume]);
  useEffect(() => setShuffle(s.shuffle), [s.shuffle]);
  useEffect(() => setRepeat(repeatMode(s.repeat)), [s.repeat]);

  const pos = drag ?? s.position;
  const pct = s.duration ? (pos / s.duration) * 100 : 0;
  const art = artUrl(s.thumb, s.videoId);

  // Clicking empty space in the bar (not a button, slider or link) opens/closes Now Playing.
  const onBarClick = (e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('button, input, .link')) onToggleNow();
  };

  return (
    <footer className="bar" onClick={onBarClick} title="Click for Now Playing">
      <div className="bar-seek">
        <input
          type="range" min={0} max={Math.max(s.duration, 1)} step={0.5} value={pos}
          style={{ ['--pct' as string]: `${pct}%` }}
          aria-label="Seek" disabled={s.ad}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={() => { if (drag !== null) player.seek(drag); setDrag(null); }}
          onKeyUp={(e) => { if (drag !== null && e.key.startsWith('Arrow')) { player.seek(drag); setDrag(null); } }}
        />
      </div>

      <div className="bar-now">
        {art ? <img src={hiRes(art, 120)} alt="" referrerPolicy="no-referrer" /> : <div className="bar-art-empty" />}
        <div className="bar-meta">
          <div className="bar-title">
            {s.title
              ? <Link onGo={() => onAlbum(s.albumId, s.albumName, s.artist, s.title)} title="Go to album">{s.title}</Link>
              : 'Nothing playing'}
          </div>
          <div className="bar-artist">
            {s.ad ? <span className="ad-chip">Advertisement</span>
              : s.artist ? <ArtistLinks artists={s.artists} fallback={s.artist} onArtist={onArtist} /> : 'Pick a song to start'}
          </div>
        </div>
        {!s.ad && <RatingButtons videoId={s.videoId} title={s.title} />}
      </div>

      <div className="bar-controls">
        <button
          className={`icon ${shuffle ? 'on' : ''}`} aria-pressed={shuffle} title={shuffle ? 'Shuffle: on' : 'Shuffle: off'}
          onClick={() => { setShuffle((v) => !v); player.shuffle(); }}
        ><Shuffle /></button>
        <button className="icon" onClick={player.prev} title="Previous" aria-label="Previous"><Prev /></button>
        <button className="play" onClick={player.toggle} title={s.playing ? 'Pause' : 'Play'} aria-label={s.playing ? 'Pause' : 'Play'}>
          {s.playing ? <Pause size={28} /> : <Play size={28} />}
        </button>
        <button className="icon" onClick={player.next} title="Next" aria-label="Next"><Next /></button>
        <button
          className={`icon ${repeat !== 'NONE' ? 'on' : ''}`} aria-pressed={repeat !== 'NONE'}
          title={repeat === 'NONE' ? 'Repeat: off' : repeat === 'ALL' ? 'Repeat: all' : 'Repeat: one'}
          onClick={() => { setRepeat(nextRepeat); player.repeat(); }}
        >
          <Repeat />
          {repeat === 'ONE' && <span className="badge">1</span>}
        </button>
        <span className="bar-time">{fmt(pos)} / {fmt(s.duration)}</span>
      </div>

      <div className="bar-extra">
        <button className="icon" onClick={() => windows.toggleMini()} title="Mini-player" aria-label="Mini-player"><Mini /></button>
        <button className={`icon ${queueOpen ? 'on' : ''}`} onClick={onToggleQueue} title="Queue" aria-label="Queue" aria-pressed={queueOpen}><Queue /></button>
        <button className={`icon ${nowOpen ? 'on' : ''}`} onClick={onToggleNow} title="Now playing & lyrics" aria-label="Now playing and lyrics" aria-pressed={nowOpen}><Mic /></button>
        <Volume />
        <input
          className="vol" type="range" min={0} max={100} value={vol} aria-label="Volume"
          style={{ ['--pct' as string]: `${vol}%` }}
          onChange={(e) => { const v = Number(e.target.value); setVol(v); player.volume(v); }}
        />
      </div>
    </footer>
  );
}
