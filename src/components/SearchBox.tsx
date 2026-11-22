import { useEffect, useMemo, useState } from 'react';
import * as ytm from '../lib/ytm';
import { Search } from './Icons';

const KEY = 'ytm-search-history';
const readHistory = (): string[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]').filter((x: unknown) => typeof x === 'string').slice(0, 8); } catch { return []; }
};
const remember = (term: string) => {
  try { localStorage.setItem(KEY, JSON.stringify([term, ...readHistory().filter((t) => t !== term)].slice(0, 8))); } catch { /* ignore */ }
};

/** The search field, with suggestions as you type and your recent searches when it's empty. */
export default function SearchBox({ onSearch }: { onSearch: (query: string) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [active, setActive] = useState(-1);
  const history = useMemo(readHistory, [open]);

  useEffect(() => {
    const term = q.trim();
    if (!term) { setSuggestions([]); return; }
    let stale = false;
    const timer = setTimeout(() => {
      ytm.searchSuggestions(term).then((r) => { if (!stale) setSuggestions(r); }).catch(() => { if (!stale) setSuggestions([]); });
    }, 180); // wait for a pause in typing
    return () => { stale = true; clearTimeout(timer); };
  }, [q]);

  const typing = q.trim().length > 0;
  const list = typing ? suggestions : history;

  const submit = (term: string) => {
    const t = term.trim();
    if (!t) return;
    remember(t);
    setQ(t);
    setOpen(false);
    setActive(-1);
    onSearch(t);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => Math.min(i + 1, list.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, -1)); }
    else if (e.key === 'Escape') { setOpen(false); setActive(-1); }
    else if (e.key === 'Enter' && active >= 0 && list[active]) { e.preventDefault(); submit(list[active]); }
  };

  const showList = open && list.length > 0;
  return (
    <form className="search" role="search" onSubmit={(e) => { e.preventDefault(); submit(q); }}>
      <Search />
      <input
        value={q} placeholder="Search songs, albums, artists" aria-label="Search"
        role="combobox" aria-expanded={showList} aria-controls="search-suggestions" aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `suggest-${active}` : undefined} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id="search-suggestions" role="listbox" className="suggest">
          {list.map((t, i) => (
            <li
              key={`${t}-${i}`} id={`suggest-${i}`} role="option" aria-selected={i === active} className={i === active ? 'active' : ''}
              onMouseDown={(e) => { e.preventDefault(); submit(t); }} // before the input loses focus
            >
              <span>{t}</span>
              {!typing && <span className="suggest-tag">Recent</span>}
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
