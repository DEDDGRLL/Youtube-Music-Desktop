/** Lightweight app-wide events, so deep components don't need props threaded through everything. */

type Listener<T> = (value: T) => void;

function channel<T>() {
  const listeners = new Set<Listener<T>>();
  return {
    emit: (value: T) => listeners.forEach((l) => l(value)),
    on: (l: Listener<T>) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}

const toast = channel<string>();
/** Show a short message at the bottom of the window. */
export const notify = toast.emit;
export const onNotify = toast.on;

export interface PickTarget { id: string; title: string }
const picker = channel<PickTarget>();
/** Open the "Add to playlist" dialog for a song. */
export const openPlaylistPicker = picker.emit;
export const onOpenPlaylistPicker = picker.on;
