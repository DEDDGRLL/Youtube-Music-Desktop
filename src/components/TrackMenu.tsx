import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as ytm from '../lib/ytm';
import { notify, openPlaylistPicker } from '../lib/ui';
import type { Track } from '../types';
import { applyRating, useRating } from './RatingButtons';

export interface MenuTarget {
  track: Track;
  x: number;
  y: number;
  /** The playlist this row belongs to, when it is one you can edit. */
  editableListId?: string;
  /** True on the Liked Music page. */
  liked?: boolean;
}

/** Right-click / "more" menu for a song in a list. */
export default function TrackMenu({ menu, onClose, onChanged }: { menu: MenuTarget; onClose: () => void; onChanged: () => void }) {
  const { track } = menu;
  const [rating, setRating] = useRating(track.id);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: menu.x, top: menu.y });

  // Keep the menu fully on screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - el.offsetWidth - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - el.offsetHeight - 8)),
    });
  }, [menu.x, menu.y]);

  useEffect(() => {
    const away = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('mousedown', away);
    window.addEventListener('keydown', key, true);
    window.addEventListener('blur', onClose);
    return () => {
      window.removeEventListener('mousedown', away);
      window.removeEventListener('keydown', key, true);
      window.removeEventListener('blur', onClose);
    };
  }, [onClose]);

  const rate = async (wanted: 'LIKE' | 'DISLIKE') => {
    onClose();
    const result = await applyRating(track.id, rating, wanted, setRating);
    // Unliking a song on the Liked Music page removes it from the list.
    if (menu.liked && result !== 'LIKE') onChanged();
  };

  const remove = async () => {
    onClose();
    try {
      await ytm.removeFromPlaylist(menu.editableListId!, track.id);
      notify('Removed from the playlist.');
      onChanged();
    } catch (e) {
      notify(`Couldn’t remove it: ${ytm.describeError(e)}`);
    }
  };

  return (
    <div className="menu" ref={ref} style={pos} role="menu" aria-label={`Actions for ${track.title}`}>
      <button role="menuitem" onClick={() => rate('LIKE')}>{rating === 'LIKE' ? 'Remove like' : 'Like'}</button>
      <button role="menuitem" onClick={() => rate('DISLIKE')}>{rating === 'DISLIKE' ? 'Remove dislike' : 'Dislike'}</button>
      <button role="menuitem" onClick={() => { onClose(); openPlaylistPicker({ id: track.id, title: track.title }); }}>Add to playlist…</button>
      {menu.editableListId && <button role="menuitem" className="danger" onClick={remove}>Remove from this playlist</button>}
    </div>
  );
}
