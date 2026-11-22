import { invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export const REPO = 'DEDDGRLL/Youtube-Music-Desktop';

export interface UpdateStatus {
  kind: 'latest' | 'available' | 'error';
  version?: string;
  notes?: string;
  /** True when the app can download and install it itself; otherwise the user downloads it from GitHub. */
  installable?: boolean;
  url?: string;
  message?: string;
}

interface NativeUpdate { configured: boolean; available: boolean; version: string; notes: string }

/** "v1.2.3" -> [1, 2, 3] */
const parts = (v: string) => v.replace(/^v/i, '').split(/[.+-]/).map((n) => parseInt(n, 10) || 0);

/** True when `candidate` is a higher version than `current`. */
export function isNewer(candidate: string, current: string): boolean {
  const a = parts(candidate);
  const b = parts(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

/**
 * Look for a newer version. If in-app updating has been set up (see the README) the app can install it;
 * otherwise this falls back to reading the latest GitHub release and pointing at the download.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateStatus> {
  try {
    const native = await invoke<NativeUpdate>('check_update');
    if (native.configured) {
      return native.available
        ? { kind: 'available', version: native.version, notes: native.notes, installable: true }
        : { kind: 'latest' };
    }
  } catch (e) {
    return { kind: 'error', message: String((e as Error)?.message ?? e) };
  }

  try {
    const res = await tauriFetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'YoutubeMusicDesktop' },
    });
    if (res.status === 404) return { kind: 'latest' }; // no releases published yet
    if (!res.ok) return { kind: 'error', message: `GitHub answered ${res.status}` };
    const rel = await res.json();
    const tag = String(rel.tag_name ?? '');
    if (tag && isNewer(tag, currentVersion)) {
      return { kind: 'available', version: tag.replace(/^v/i, ''), notes: String(rel.body ?? ''), installable: false, url: String(rel.html_url ?? `https://github.com/${REPO}/releases`) };
    }
    return { kind: 'latest' };
  } catch (e) {
    return { kind: 'error', message: String((e as Error)?.message ?? e) };
  }
}

export const installUpdate = () => invoke('install_update');
export const openLink = (url: string) => invoke('open_link', { url });
