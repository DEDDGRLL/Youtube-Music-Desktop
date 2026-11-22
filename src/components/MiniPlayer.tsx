import { useState } from 'react';
import { player, usePlayerFull, windows } from '../lib/player';
import { artUrl, hiRes } from '../lib/ytm';
import { Expand, Next, Pause, Play, Prev } from './Icons';

/** The small always-on-top window: artwork, song, and basic controls. Drag it by any empty part. */
export default function MiniPlayer() {
  const s = usePlayerFull();
  const [drag, setDrag] = useState<number | null>(null);
  const art = artUrl(s.thumb, s.videoId);
  const pos = drag ?? s.position;
  const pct = s.duration ? (pos / s.duration) * 100 : 0;

  return (
    <div className="mini" data-tauri-drag-region>
      {art ? <img className="mini-art" src={hiRes(art, 200)} alt="" referrerPolicy="no-referrer" data-tauri-drag-region /> : <div className="mini-art" data-tauri-drag-region />}
      <div className="mini-main" data-tauri-drag-region>
        <div className="mini-title" data-tauri-drag-region>{s.title || 'Nothing playing'}</div>
        <div className="mini-artist" data-tauri-drag-region>{s.ad ? 'Advertisement' : s.artist}</div>
        <div className="mini-controls">
          <button className="icon" onClick={player.prev} title="Previous" aria-label="Previous"><Prev /></button>
          <button className="play small" onClick={player.toggle} title={s.playing ? 'Pause' : 'Play'} aria-label={s.playing ? 'Pause' : 'Play'}>
            {s.playing ? <Pause size={22} /> : <Play size={22} />}
          </button>
          <button className="icon" onClick={player.next} title="Next" aria-label="Next"><Next /></button>
        </div>
      </div>
      <button className="icon mini-expand" onClick={() => windows.showMain()} title="Back to the full window" aria-label="Back to the full window"><Expand /></button>
      <div className="mini-seek">
        <input
          type="range" min={0} max={Math.max(s.duration, 1)} step={0.5} value={pos} aria-label="Seek" disabled={s.ad}
          style={{ ['--pct' as string]: `${pct}%` }}
          onChange={(e) => setDrag(Number(e.target.value))}
          onPointerUp={() => { if (drag !== null) player.seek(drag); setDrag(null); }}
        />
      </div>
    </div>
  );
}
