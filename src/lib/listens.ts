import type { Listen } from './tracker';

/** The listening history, kept on this computer in the app's own browser storage (IndexedDB). */

const DB = 'ytm-listening';
const STORE = 'listens';
let opened: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  opened ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const store = req.result.createObjectStore(STORE, { keyPath: 'key', autoIncrement: true });
      store.createIndex('ts', 'ts');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { opened = null; reject(req.error); };
  });
  return opened;
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise<T>((resolve, reject) => {
    const req = work(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const addListen = (listen: Listen) => run('readwrite', (s) => s.add(listen)).then(() => undefined);
export const countListens = () => run('readonly', (s) => s.count());
export const clearListens = () => run('readwrite', (s) => s.clear()).then(() => undefined);

/** Every listen at or after `since` (milliseconds), oldest first. */
export const listensSince = (since: number): Promise<Listen[]> =>
  run('readonly', (s) => s.index('ts').getAll(IDBKeyRange.lowerBound(since)) as IDBRequest<Listen[]>);

/** The most recent listens, newest first. */
export async function recentListens(limit: number): Promise<Listen[]> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const out: Listen[] = [];
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).index('ts').openCursor(null, 'prev');
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor && out.length < limit) { out.push(cursor.value as Listen); cursor.continue(); } else resolve(out);
    };
    req.onerror = () => reject(req.error);
  });
}
