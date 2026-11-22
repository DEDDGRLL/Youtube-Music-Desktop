import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as ytm from '../lib/ytm';
import { notify, type PickTarget } from '../lib/ui';
import type { Collection } from '../types';
import { Cover } from './Cards';

export type DialogState =
  | { kind: 'new'; track?: PickTarget }
  | { kind: 'rename'; id: string; title: string }
  | { kind: 'delete'; id: string; title: string }
  | { kind: 'pick'; track: PickTarget };

const message = (e: unknown) => ytm.describeError(e);

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', key, true);
    // Start on the first field or button so the keyboard works straight away.
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

/** One-field form: used for naming a new playlist and renaming one. */
function NameForm({ initial, action, busyLabel, onSubmit, onClose, hint }: {
  initial: string; action: string; busyLabel: string; hint?: string;
  onSubmit: (name: string) => Promise<void>; onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    setError('');
    try { await onSubmit(value); } catch (e) { setError(message(e)); setBusy(false); }
  };
  return (
    <>
      {hint && <p className="muted modal-hint">{hint}</p>}
      <input
        className="modal-input" value={name} maxLength={150} placeholder="Playlist name" aria-label="Playlist name"
        onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-actions">
        <button className="ghost" onClick={onClose}>Cancel</button>
        <button className="primary small" disabled={!name.trim() || busy} onClick={submit}>{busy ? busyLabel : action}</button>
      </div>
    </>
  );
}

export default function DialogHost({ dialog, playlists, onClose, onSwitch, onChanged, onDeleted }: {
  dialog: DialogState;
  playlists: Collection[];
  onClose: () => void;
  onSwitch: (d: DialogState) => void;
  /** A playlist was created, renamed or had a song added. */
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  if (dialog.kind === 'new') {
    const track = dialog.track;
    return (
      <Modal title="New playlist" onClose={onClose}>
        <NameForm
          initial="" action="Create" busyLabel="Creating…" onClose={onClose}
          hint={track ? `“${track.title}” will be added to it.` : undefined}
          onSubmit={async (name) => {
            await ytm.createPlaylist(name, track ? [track.id] : []);
            notify(`Created “${name}”.`);
            onChanged();
            onClose();
          }}
        />
      </Modal>
    );
  }

  if (dialog.kind === 'rename') {
    return (
      <Modal title="Rename playlist" onClose={onClose}>
        <NameForm
          initial={dialog.title} action="Save" busyLabel="Saving…" onClose={onClose}
          onSubmit={async (name) => {
            await ytm.renamePlaylist(dialog.id, name);
            notify('Playlist renamed.');
            onChanged();
            onClose();
          }}
        />
      </Modal>
    );
  }

  if (dialog.kind === 'delete') {
    const doDelete = async () => {
      setBusyId('delete');
      setError('');
      try {
        await ytm.deletePlaylist(dialog.id);
        notify(`Deleted “${dialog.title}”.`);
        onDeleted();
        onClose();
      } catch (e) { setError(message(e)); setBusyId(''); }
    };
    return (
      <Modal title="Delete playlist?" onClose={onClose}>
        <p className="muted modal-hint">“{dialog.title}” will be deleted from your account. The songs themselves are not affected.</p>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="modal-actions">
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary small danger-btn" disabled={!!busyId} onClick={doDelete}>{busyId ? 'Deleting…' : 'Delete'}</button>
        </div>
      </Modal>
    );
  }

  // pick: choose which playlist to add a song to
  const { track } = dialog;
  const add = async (list: Collection) => {
    setBusyId(list.id);
    setError('');
    try {
      await ytm.addToPlaylist(list.id, track.id);
      notify(`Added to “${list.title}”.`);
      onChanged();
      onClose();
    } catch (e) {
      setError(`Couldn’t add it to “${list.title}”: ${message(e)}`);
      setBusyId('');
    }
  };
  return (
    <Modal title="Add to playlist" onClose={onClose}>
      <p className="muted modal-hint">“{track.title}”</p>
      <button className="pick-row new" onClick={() => onSwitch({ kind: 'new', track })}>
        <span className="pick-plus" aria-hidden="true">+</span>New playlist
      </button>
      <div className="pick-list">
        {playlists.map((p) => (
          <button key={p.id} className="pick-row" disabled={!!busyId} onClick={() => add(p)}>
            <Cover src={p.thumb} className="pick-art" />
            <span className="pick-title">{p.title}</span>
            {busyId === p.id && <span className="muted">Adding…</span>}
          </button>
        ))}
        {!playlists.length && <p className="muted">You don’t have any playlists yet.</p>}
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="modal-actions"><button className="ghost" onClick={onClose}>Close</button></div>
    </Modal>
  );
}
