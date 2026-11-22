import { useEffect, useState } from 'react';
import * as ytm from '../lib/ytm';
import { notify, openPlaylistPicker } from '../lib/ui';
import { PlaylistAdd, ThumbDown, ThumbUp } from './Icons';

/** A song's like/dislike state, kept in sync with changes made anywhere in the app. */
export function useRating(videoId: string): [ytm.Rating, (r: ytm.Rating) => void] {
  const [rating, setRating] = useState<ytm.Rating>('INDIFFERENT');
  useEffect(() => {
    if (!videoId) { setRating('INDIFFERENT'); return; }
    let stale = false;
    setRating(ytm.cachedRating(videoId) ?? 'INDIFFERENT');
    ytm.likeStatus(videoId).then((r) => { if (!stale) setRating(r); }).catch(() => { /* keep the default */ });
    const off = ytm.onRatingChange((id, r) => { if (id === videoId) setRating(r); });
    return () => { stale = true; off(); };
  }, [videoId]);
  return [rating, setRating];
}

/** Change a rating with an instant UI update, and undo it if YouTube Music refuses. */
export async function applyRating(
  videoId: string, current: ytm.Rating, wanted: 'LIKE' | 'DISLIKE', show: (r: ytm.Rating) => void,
): Promise<ytm.Rating> {
  const next: ytm.Rating = current === wanted ? 'INDIFFERENT' : wanted;
  show(next);
  try {
    await ytm.setRating(videoId, next);
    notify(next === 'LIKE' ? 'Added to Liked Music.' : next === 'DISLIKE' ? 'Disliked.' : 'Rating removed.');
    return next;
  } catch (e) {
    show(current);
    notify(`Couldn’t update the rating: ${ytm.describeError(e)}`);
    return current;
  }
}

export default function RatingButtons({ videoId, title }: { videoId: string; title: string }) {
  const [rating, setRating] = useRating(videoId);
  if (!videoId) return null;
  return (
    <div className="rating">
      <button className={`icon ${rating === 'DISLIKE' ? 'on' : ''}`} aria-pressed={rating === 'DISLIKE'} title="Dislike" aria-label="Dislike"
        onClick={() => applyRating(videoId, rating, 'DISLIKE', setRating)}><ThumbDown filled={rating === 'DISLIKE'} /></button>
      <button className={`icon ${rating === 'LIKE' ? 'on' : ''}`} aria-pressed={rating === 'LIKE'} title="Like" aria-label="Like"
        onClick={() => applyRating(videoId, rating, 'LIKE', setRating)}><ThumbUp filled={rating === 'LIKE'} /></button>
      <button className="icon" title="Add to playlist" aria-label="Add to playlist"
        onClick={() => openPlaylistPicker({ id: videoId, title })}><PlaylistAdd /></button>
    </div>
  );
}
