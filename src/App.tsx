import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, Cover, ShelfRow, TrackList } from './components/Cards';
import DialogHost, { type DialogState } from './components/Dialogs';
import { Back, Close, Explore, Gear, Heart, Home, Library, Plus, Search } from './components/Icons';
import NowPlaying from './components/NowPlaying';
import PlayerBar from './components/PlayerBar';
import QueuePanel from './components/QueuePanel';
import SearchBox from './components/SearchBox';
import SettingsView from './components/SettingsView';
import TrackMenu, { type MenuTarget } from './components/TrackMenu';
import SignIn from './components/SignIn';
import { auth, player, usePlayerSel } from './lib/player';
import { getSettings } from './lib/settings';
import { notify, onNotify, onOpenPlaylistPicker } from './lib/ui';
import { checkForUpdate } from './lib/updates';
import { getVersion } from '@tauri-apps/api/app';
import * as ytm from './lib/ytm';
import type { Collection, Item, SearchType, Shelf, Track, View } from './types';

type Auth = 'checking' | 'signed-out' | 'waiting' | 'ready';
const hasSession = (cookie: string) => /(^|;\s*)(__Secure-3PAPISID|SAPISID)=/.test(cookie);

/** Small async helper: runs `load`, tracks loading + error state. */
function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let stale = false;
    setData(null);
    setError('');
    load().then((d) => !stale && setData(d)).catch((e) => !stale && setError(String(e?.message ?? e)));
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, error };
}

export default function App() {
  const [authState, setAuthState] = useState<Auth>('checking');
  const [authError, setAuthError] = useState('');
  const [stack, setStack] = useState<View[]>([{ name: 'home' }]);
  const view = stack[stack.length - 1];
  const [nowOpen, setNowOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  // Bumped after an edit so the open playlist page reloads.
  const [pageVersion, setPageVersion] = useState(0);
  const noticeTimer = useRef<number>();
  const [playlists, setPlaylists] = useState<Collection[]>([]);
  const waiting = useRef(false);

  // --- session: poll the hidden player's cookies until a Google session exists, refresh them periodically ---
  const connect = useCallback(async (cookie: string) => {
    await ytm.connect(cookie);
    setAuthState('ready');
    ytm.libraryPlaylists().then(setPlaylists).catch(console.error);
  }, []);

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const cookie = await auth.cookies();
        if (stop) return;
        if (hasSession(cookie)) {
          if (waiting.current) { waiting.current = false; await auth.hideLogin(); }
          await connect(cookie);
          return;
        }
        setAuthState((s) => (s === 'waiting' ? s : 'signed-out'));
      } catch (e) {
        setAuthError(String(e));
      }
      if (!stop) setTimeout(tick, 2000);
    };
    tick();
    const refresh = setInterval(async () => {
      try { const c = await auth.cookies(); if (hasSession(c)) await ytm.connect(c); } catch { /* keep old session */ }
    }, 20 * 60 * 1000);
    return () => { stop = true; clearInterval(refresh); };
  }, [connect]);

  const startSignIn = async () => {
    waiting.current = true;
    setAuthState('waiting');
    await auth.showLogin();
  };

  useEffect(() => { contentRef.current?.scrollTo(0, 0); }, [stack]);

  // Navigation: sidebar items start a fresh trail; everything else pushes so Back works.
  const push = (v: View) => { setNowOpen(false); setStack((st) => [...st, v]); };
  const reset = (v: View) => { setNowOpen(false); setStack([v]); };
  const replaceTop = (v: View) => setStack((st) => [...st.slice(0, -1), v]);
  const back = () => setStack((st) => (st.length > 1 ? st.slice(0, -1) : st));

  const play = (t: Track, playlistId?: string) => player.load(t, playlistId);
  const open = (c: Collection) => push(c.kind === 'artist' ? { name: 'artist', id: c.id, title: c.title } : { name: 'collection', collection: c });
  const say = (message: string, ms = 3500) => {
    setNotice(message);
    window.clearTimeout(noticeTimer.current);
    if (ms) noticeTimer.current = window.setTimeout(() => setNotice(''), ms);
  };

  useEffect(() => onNotify((m) => say(m, Math.min(12000, Math.max(3500, m.length * 70)))), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => onOpenPlaylistPicker((t) => setDialog({ kind: 'pick', track: t })), []);

  // Once signed in, quietly look for a newer version (if the user hasn't turned that off).
  useEffect(() => {
    if (authState !== 'ready') return;
    let cancelled = false;
    (async () => {
      try {
        const [prefs, version] = await Promise.all([getSettings(), getVersion()]);
        if (!prefs.checkUpdates) return;
        const found = await checkForUpdate(version);
        if (!cancelled && found.kind === 'available') notify(`Version ${found.version} is available. Open Settings to update.`);
      } catch { /* an update check must never get in the way */ }
    })();
    return () => { cancelled = true; };
  }, [authState]);

  const refreshPlaylists = () => { ytm.libraryPlaylists().then(setPlaylists).catch(console.error); };
  const playlistsChanged = () => { refreshPlaylists(); setPageVersion((v) => v + 1); };

  // Names without a known id are looked up by name first, with a short status message.
  const openArtist = async (id: string, title?: string) => {
    let real = id;
    if (!real) {
      if (!title) return;
      say(`Finding ${title}…`, 0);
      real = (await ytm.findArtistId(title)) ?? '';
    }
    if (!real) return say(`Couldn’t find an artist page for “${title}”.`);
    setNotice('');
    push({ name: 'artist', id: real, title });
  };
  const openAlbum = async (id: string, album = '', artist = '', song = '') => {
    let real = id;
    if (!real) {
      say('Finding the album…', 0);
      real = (await ytm.findAlbumId(album, artist, song)) ?? '';
    }
    if (!real) return say(`Couldn’t find the album${album ? ` “${album}”` : ''}.`);
    setNotice('');
    push({ name: 'collection', collection: { kind: 'album', id: real, title: album, subtitle: artist, thumb: '' } });
  };

  if (authState !== 'ready') {
    if (authState === 'checking') return <main className="signin"><p className="muted">Starting…</p></main>;
    return <SignIn waiting={authState === 'waiting'} error={authError} onStart={startSignIn} />;
  }

  const nav = (name: View['name'], label: string, icon: JSX.Element, v: View) => (
    <button className={`nav ${view.name === name && stack.length === 1 ? 'active' : ''}`} onClick={() => reset(v)}>{icon}{label}</button>
  );

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><span className="brand-mark" aria-hidden="true" />Youtube Music</div>
        <nav>
          {nav('home', 'Home', <Home />, { name: 'home' })}
          {nav('browse', 'Explore', <Explore />, { name: 'browse', browseId: 'FEmusic_explore', title: 'Explore' })}
          {nav('library', 'Library', <Library />, { name: 'library' })}
          {nav('liked', 'Liked Music', <Heart />, { name: 'liked' })}
        </nav>
        <div className="side-label-row">
          <span className="side-label">Playlists</span>
          <button className="icon small" onClick={() => setDialog({ kind: 'new' })} aria-label="New playlist" title="New playlist"><Plus /></button>
        </div>
        <div className="side-list">
          {playlists.map((p) => (
            <button key={p.id} className="side-item" onClick={() => open(p)} title={p.title}>{p.title}</button>
          ))}
        </div>
        <div className="side-bottom">{nav('settings', 'Settings', <Gear />, { name: 'settings' })}</div>
      </aside>

      <div className="main">
        <header className="top">
          <button className="icon back" onClick={back} disabled={stack.length < 2} aria-label="Back" title="Back"><Back /></button>
          <SearchBox onSearch={(q) => push({ name: 'search', query: q, type: 'all' })} />
        </header>

        <div className="content" ref={contentRef}>
          {view.name === 'home' && <HomeView onOpen={open} onPlay={play} />}
          {view.name === 'search' && (
            <SearchView
              key={view.query} query={view.query} type={view.type ?? 'all'} onOpen={open} onPlay={play}
              onArtist={openArtist} onAlbum={openAlbum} onMenu={setMenu}
              onType={(type) => replaceTop({ name: 'search', query: view.query, type })}
            />
          )}
          {view.name === 'browse' && (
            <BrowseView
              key={`${view.browseId}|${view.params ?? ''}`} browseId={view.browseId} params={view.params} title={view.title}
              onBrowse={(b) => push({ name: 'browse', browseId: b.browseId, params: b.params, title: b.label })}
              onOpen={open} onPlay={play}
            />
          )}
          {view.name === 'artist' && <ArtistView key={view.id} id={view.id} title={view.title} onOpen={open} onPlay={play} onArtist={openArtist} onAlbum={openAlbum} />}
          {view.name === 'settings' && <SettingsView onSignOut={async () => { await auth.signOut(); location.reload(); }} />}
          {view.name === 'library' && <LibraryView items={playlists} onOpen={open} onPlay={play} onNew={() => setDialog({ kind: 'new' })} onArtist={openArtist} onAlbum={openAlbum} onMenu={setMenu} />}
          {view.name === 'liked' && <TrackPageView key={`liked-${pageVersion}`} cacheKey="pl:LM" liked load={(cb) => ytm.likedSongs(cb)} onArtist={openArtist} onAlbum={openAlbum} onMenu={setMenu} onRename={() => {}} onDelete={() => {}} />}
          {view.name === 'collection' && (
            <TrackPageView
              key={`${view.collection.id}-${pageVersion}`}
              cacheKey={`${view.collection.kind === 'album' ? 'al' : 'pl'}:${view.collection.id}`}
              load={(cb) => (view.collection.kind === 'album' ? ytm.album(view.collection.id) : ytm.playlist(view.collection.id, 500, cb))}
              onArtist={openArtist}
              onAlbum={openAlbum}
              onMenu={setMenu}
              onRename={(id, title) => setDialog({ kind: 'rename', id, title })}
              onDelete={(id, title) => setDialog({ kind: 'delete', id, title })}
            />
          )}
        </div>
      </div>

      {notice && <div className="toast" role="status">{notice}</div>}
      {menu && <TrackMenu menu={menu} onClose={() => setMenu(null)} onChanged={playlistsChanged} />}
      {dialog && (
        <DialogHost
          dialog={dialog} playlists={playlists}
          onClose={() => setDialog(null)} onSwitch={setDialog}
          onChanged={playlistsChanged}
          onDeleted={() => { refreshPlaylists(); back(); }}
        />
      )}
      {queueOpen && <QueuePanel onClose={() => setQueueOpen(false)} onArtist={(id, name) => { setQueueOpen(false); openArtist(id, name); }} />}
      {nowOpen && <NowPlaying onClose={() => setNowOpen(false)} onArtist={openArtist} onAlbum={openAlbum} />}
      <PlayerBar nowOpen={nowOpen} onToggleNow={() => setNowOpen((o) => !o)} queueOpen={queueOpen} onToggleQueue={() => setQueueOpen((o) => !o)} onArtist={openArtist} onAlbum={openAlbum} />
    </div>
  );
}

type Handlers = { onOpen: (c: Collection) => void; onPlay: (t: Track) => void };

function Status({ error, empty }: { error: string; empty?: string }) {
  if (error) return <p className="error" role="alert">Couldn’t load this: {error}</p>;
  return <p className="muted">{empty ?? 'Loading…'}</p>;
}

/** Explore, and the pages its buttons open (new releases, charts, moods and genres). */
function BrowseView({ browseId, params, title, onBrowse, ...h }: Handlers & {
  browseId: string; params?: string; title: string; onBrowse: (b: ytm.BrowseButton) => void;
}) {
  const { data, error } = useAsync(() => ytm.browsePage(browseId, params), [browseId, params]);
  if (!data) return <Status error={error} />;
  return (
    <>
      <h1 className="browse-title">{title}</h1>
      {data.buttons.length > 0 && (
        <div className="chips" role="group" aria-label={`${title} sections`}>
          {data.buttons.map((b) => <button key={`${b.browseId}|${b.params ?? ''}|${b.label}`} className="chip" onClick={() => onBrowse(b)}>{b.label}</button>)}
        </div>
      )}
      {data.shelves.map((sh, i) => <ShelfRow key={i} shelf={sh} onOpen={h.onOpen} onPlay={h.onPlay} />)}
      {!data.shelves.length && !data.buttons.length && <Status error="" empty="Nothing to show here right now." />}
    </>
  );
}

function HomeView(h: Handlers) {
  const { data, error } = useAsync<Shelf[]>(() => ytm.homeFeed(), []);
  if (!data) return <Status error={error} />;
  return <>{data.map((s, i) => <ShelfRow key={i} shelf={s} {...h} />)}</>;
}

const SEARCH_TABS: { type: SearchType; label: string }[] = [
  { type: 'all', label: 'All' },
  { type: 'song', label: 'Songs' },
  { type: 'album', label: 'Albums' },
  { type: 'artist', label: 'Artists' },
  { type: 'playlist', label: 'Playlists' },
];

/** A row of filter chips. */
function Chips<T extends string>({ tabs, value, onChange, label }: { tabs: { type: T; label: string }[]; value: T; onChange: (t: T) => void; label: string }) {
  return (
    <div className="chips" role="group" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.type} className="chip" aria-pressed={value === t.type} onClick={() => onChange(t.type)}>{t.label}</button>
      ))}
    </div>
  );
}

/** Songs as a list, anything else as a grid of cards. */
function ItemsView({ list, onOpen, onPlay, onArtist, onAlbum, onMenu }: Handlers & {
  list: Item[]; onArtist: (id: string, name?: string) => void; onAlbum: (id: string, album: string, artist?: string, song?: string) => void; onMenu: (t: MenuTarget) => void;
}) {
  const current = usePlayerSel((s) => s.videoId);
  const tracks = list.filter((i): i is Track => i.kind === 'track');
  if (list.length && tracks.length === list.length) {
    return <TrackList tracks={tracks} current={current} onPlay={(t) => onPlay(t)} onArtist={onArtist} onAlbum={onAlbum} onMenu={(t, x, y) => onMenu({ track: t, x, y })} />;
  }
  return <div className="grid">{list.map((c, i) => <Card key={`${c.id}-${i}`} item={c} onOpen={onOpen} onPlay={onPlay} />)}</div>;
}

function SearchView({ query, type, onType, onArtist, onAlbum, onMenu, ...h }: Handlers & {
  query: string; type: SearchType; onType: (t: SearchType) => void;
  onArtist: (id: string, name?: string) => void; onAlbum: (id: string, album: string, artist?: string, song?: string) => void; onMenu: (t: MenuTarget) => void;
}) {
  const { data, error } = useAsync<Shelf[]>(() => ytm.search(query, type === 'all' ? undefined : type), [query, type]);
  return (
    <>
      <Chips tabs={SEARCH_TABS} value={type} onChange={onType} label="Kind of result" />
      {!data ? <Status error={error} empty={`Searching for “${query}”…`} />
        : !data.length ? <Status error="" empty={`No results for “${query}”.`} />
        : type === 'all' ? <>{data.map((sh, i) => <ShelfRow key={i} shelf={sh} onOpen={h.onOpen} onPlay={h.onPlay} />)}</>
        : <ItemsView list={data.flatMap((sh) => sh.items)} onArtist={onArtist} onAlbum={onAlbum} onMenu={onMenu} {...h} />}
    </>
  );
}

const LIBRARY_ORDER = ['Playlists', 'Songs', 'Albums', 'Artists'];

/** Which tabs to show, from the filter names YouTube Music offers. */
function pickTabs(filters: string[]): string[] {
  const lower = new Map(filters.map((f) => [f.toLowerCase(), f]));
  const known = LIBRARY_ORDER.slice(1).filter((n) => lower.has(n.toLowerCase())).map((n) => lower.get(n.toLowerCase())!);
  if (known.length) return ['Playlists', ...known];
  // Names we don't recognise (e.g. another language): offer whatever it gives us.
  return ['Playlists', ...filters.filter((f) => !/^playlists?$/i.test(f)).slice(0, 5)];
}

function LibraryView({ items, onNew, onArtist, onAlbum, onMenu, ...h }: Handlers & {
  items: Collection[]; onNew: () => void;
  onArtist: (id: string, name?: string) => void; onAlbum: (id: string, album: string, artist?: string, song?: string) => void; onMenu: (t: MenuTarget) => void;
}) {
  const [tabs, setTabs] = useState<string[]>(['Playlists']);
  const [tab, setTab] = useState('Playlists');
  const [data, setData] = useState<Item[] | null>(null);
  const [error, setError] = useState('');
  const cache = useRef(new Map<string, Item[]>());
  const isPlaylists = /^playlists?$/i.test(tab);

  useEffect(() => { ytm.libraryFilters().then((f) => setTabs(pickTabs(f))).catch(() => { /* just Playlists */ }); }, []);

  useEffect(() => {
    setError('');
    if (isPlaylists) { setData(items); return; }
    const hit = cache.current.get(tab);
    if (hit) { setData(hit); return; }
    let stale = false;
    setData(null);
    ytm.libraryTab(tab)
      .then((r) => { if (!stale) { cache.current.set(tab, r); setData(r); } })
      .catch((e) => { if (!stale) setError(String(e?.message ?? e)); });
    return () => { stale = true; };
  }, [tab, items, isPlaylists]);

  return (
    <section className="shelf">
      <div className="section-head">
        <h2>Your library</h2>
        {isPlaylists && <button className="primary small" onClick={onNew}>New playlist</button>}
      </div>
      {tabs.length > 1 && <Chips tabs={tabs.map((t) => ({ type: t, label: t }))} value={tab} onChange={setTab} label="Library section" />}
      {!data ? <Status error={error} />
        : !data.length ? <Status error="" empty={isPlaylists ? 'No playlists in your library yet.' : `Nothing in ${tab} yet.`} />
        : <ItemsView list={data} onArtist={onArtist} onAlbum={onAlbum} onMenu={onMenu} {...h} />}
    </section>
  );
}

/** Lowercase and strip accents so "lodz" finds "Łódź". */
const fold = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ł/g, 'l').replace(/đ/g, 'd').replace(/ø/g, 'o');

function TrackPageView({
  cacheKey, load, liked, onArtist, onAlbum, onMenu, onRename, onDelete,
}: {
  cacheKey: string;
  load: (onProgress: (p: ytm.TrackPage) => void) => Promise<ytm.TrackPage>;
  liked?: boolean;
  onArtist: (id: string, name?: string) => void;
  onAlbum: (id: string, album: string, artist?: string, song?: string) => void;
  onMenu: (target: MenuTarget) => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string, title: string) => void;
}) {
  // Show a cached copy instantly, then refresh; songs appear page by page while loading.
  const [data, setData] = useState<ytm.TrackPage | null>(() => ytm.peek(cacheKey) ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const filterRef = useRef<HTMLInputElement>(null);
  const current = usePlayerSel((s) => s.videoId);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError('');
    load((p) => { if (!stale) setData(p); })
      .then((p) => { if (!stale) { setData(p); setLoading(false); } })
      .catch((e) => { if (!stale) { setError(String(e?.message ?? e)); setLoading(false); } });
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Ctrl+F jumps to the filter box.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        filterRef.current?.focus();
        filterRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const words = useMemo(() => fold(query).split(/\s+/).filter(Boolean), [query]);
  const shown = useMemo(() => {
    if (!data) return [];
    if (!words.length) return data.tracks;
    return data.tracks.filter((t) => {
      const hay = fold(`${t.title} ${t.artist} ${t.album ?? ''}`);
      return words.every((w) => hay.includes(w));
    });
  }, [data, words]);

  if (!data) return <Status error={error} />;
  const canEdit = !!data.editable && !liked && !!data.playlistId;

  return (
    <>
      <div className="page-head">
        <Cover src={data.thumb} className="page-art" />
        <div>
          <h1>{data.title || 'Liked Music'}</h1>
          <p className="muted">
            {loading ? `${data.tracks.length} songs · loading more…` : data.subtitle}
          </p>
          <div className="page-actions">
            <button className="primary" disabled={!data.tracks.length} onClick={() => player.load(data.tracks[0], data.playlistId)}>
              Play
            </button>
            {canEdit && <button className="ghost" onClick={() => onRename(data.playlistId!, data.title)}>Rename</button>}
            {canEdit && <button className="ghost danger" onClick={() => onDelete(data.playlistId!, data.title)}>Delete</button>}
          </div>
        </div>
      </div>

      {error && <p className="error" role="alert">Couldn’t load everything: {error}</p>}

      {data.tracks.length > 0 && (
        <div className="page-filter">
          <Search />
          <input
            ref={filterRef} value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filter ${data.tracks.length} songs  (Ctrl+F)`} aria-label="Filter songs in this list"
            onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); e.currentTarget.blur(); } }}
          />
          {query && <button className="icon small" onClick={() => setQuery('')} aria-label="Clear filter"><Close /></button>}
        </div>
      )}
      {query && (
        <p className="muted filter-note">
          {shown.length} of {data.tracks.length} songs{loading ? ' loaded so far' : ''}
        </p>
      )}
      {query && !shown.length && !loading && <p className="muted">No songs match “{query}”.</p>}

      <TrackList
        key={query}
        tracks={shown} current={current}
        onPlay={(t) => player.load(t, data.playlistId)}
        onArtist={onArtist} onAlbum={onAlbum}
        onMenu={(t, x, y) => onMenu({ track: t, x, y, liked, editableListId: canEdit ? data.playlistId : undefined })}
      />
    </>
  );
}

function ArtistView({
  id, title, onOpen, onPlay, onArtist, onAlbum,
}: Handlers & { id: string; title?: string; onArtist: (id: string, name?: string) => void; onAlbum: (id: string, album: string, artist?: string, song?: string) => void }) {
  const { data, error } = useAsync(() => ytm.artist(id, title), [id]);
  const current = usePlayerSel((s) => s.videoId);
  if (!data) return <Status error={error} />;
  const firstTrack = data.shelves.flatMap((sh) => sh.items).find((i): i is Track => i.kind === 'track');
  return (
    <>
      <div className="page-head">
        <Cover src={data.thumb} className="page-art round" />
        <div>
          <h1>{data.name}</h1>
          {data.note && <p className="muted note">{data.note}</p>}
          <button className="primary" disabled={!firstTrack} onClick={() => firstTrack && onPlay(firstTrack)}>Play</button>
        </div>
      </div>
      {data.shelves.map((sh, i) => {
        const tracks = sh.items.filter((x): x is Track => x.kind === 'track');
        // A shelf made only of songs reads better as a list than as a row of cards.
        return tracks.length === sh.items.length ? (
          <section className="shelf" key={i}>
            <h2>{sh.title}</h2>
            <TrackList tracks={tracks} current={current} onPlay={(t) => onPlay(t)} onArtist={onArtist} onAlbum={onAlbum} />
          </section>
        ) : (
          <ShelfRow key={i} shelf={sh} onOpen={onOpen} onPlay={onPlay} />
        );
      })}
    </>
  );
}
