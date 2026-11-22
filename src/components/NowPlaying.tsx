import { useEffect, useState } from 'react';
import { usePlayerFull } from '../lib/player';
import { artUrl, hiRes } from '../lib/ytm';
import { ArtistLinks, Link } from './Cards';
import { Close } from './Icons';
import LyricsPane from './Lyrics';
import RatingButtons from './RatingButtons';

/** Full "Now playing" view: large artwork + track details on the left, lyrics on the right. */
export default function NowPlaying({
  onClose, onArtist, onAlbum,
}: {
  onClose: () => void;
  onArtist: (id: string, name?: string) => void;
  onAlbum: (id: string, album: string, artist?: string, song?: string) => void;
}) {
  const s = usePlayerFull();
  const [hasLyrics, setHasLyrics] = useState(false);
  const art = artUrl(s.thumb, s.videoId);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <section className="now" aria-label="Now playing">
      {art && <div className="now-bg" style={{ backgroundImage: `url(${hiRes(art, 200)})` }} />}
      <button className="icon now-close" onClick={onClose} aria-label="Close now playing" title="Close (Esc)"><Close /></button>

      <div className={`now-body ${hasLyrics ? '' : 'solo'}`}>
      <div className="now-info">
        {art ? <img className="now-art" src={hiRes(art, 600)} alt="" referrerPolicy="no-referrer" /> : <div className="now-art" />}
        <h1 className="now-title">
          {s.title
            ? <Link onGo={() => onAlbum(s.albumId, s.albumName, s.artist, s.title)} title="Go to album">{s.title}</Link>
            : 'Nothing playing'}
        </h1>
        <div className="now-artist"><ArtistLinks artists={s.artists} fallback={s.artist} onArtist={onArtist} /></div>
        <RatingButtons videoId={s.videoId} title={s.title} />
        {s.albumName && (
          <div className="now-album">
            <Link onGo={() => onAlbum(s.albumId, s.albumName, s.artist, s.title)}>{s.albumName}</Link>
          </div>
        )}
      </div>

      <div className="now-lyrics"><LyricsPane onAvailable={setHasLyrics} /></div>
      </div>
    </section>
  );
}
