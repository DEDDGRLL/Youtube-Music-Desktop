import { useEffect, useState } from 'react';
import { recentErrors } from '../lib/diag';
import { usePlayerFull } from '../lib/player';
import { notify } from '../lib/ui';
import type { Settings } from '../lib/settings';

type Status = 'ok' | 'bad' | 'info';
interface Row { label: string; status: Status; detail?: string }

const word: Record<Status, string> = { ok: 'OK', bad: 'Problem', info: 'Info' };

/** What the app can see of the hidden YouTube Music player, plus a report to copy when something is wrong. */
export default function Diagnostics({ settings, version }: { settings: Settings; version: string }) {
  const s = usePlayerFull();
  const d = s.diag;
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);

  const age = s.at ? Math.round((Date.now() - s.at) / 1000) : null;
  const has = (ok: boolean | undefined, label: string): Row => ({
    label,
    // The player bar only exists once a song has played, so absence before that is expected.
    status: ok ? 'ok' : d?.playerBar ? 'bad' : 'info',
    detail: ok ? 'found' : d?.playerBar ? 'not found on the page' : 'appears after a song starts',
  });

  const rows: Row[] = [
    { label: 'Hearing from the player', status: age !== null && age < 5 ? 'ok' : 'bad', detail: age === null ? 'nothing received yet' : `last update ${age}s ago` },
  ];
  if (d) {
    rows.push(
      { label: 'Player page loaded', status: d.player && d.playerApi ? 'ok' : 'bad', detail: d.url },
      has(d.playerBar, 'Player bar'),
      has(d.shuffleButton, 'Shuffle button'),
      has(d.repeatButton, 'Repeat button'),
      has(d.likeButton, 'Like button'),
      has(d.volumeSlider, 'Volume slider'),
      { label: 'Songs in the page’s queue', status: 'info', detail: String(d.queueItems) },
      { label: 'Repeat mode read from the page', status: 'info', detail: `${d.repeatRead ?? 'not readable'} (attribute: ${d.repeatAttribute ?? 'none'})` },
      { label: 'Last song switch', status: 'info', detail: d.lastLoad ? `${d.lastLoad.method}${d.lastLoad.why ? ` (${d.lastLoad.why})` : ''}${d.lastLoad.ms ? ` in ${d.lastLoad.ms} ms` : ''}` : 'none yet' },
      { label: 'In-page switching', status: d.queueStrikes >= 2 ? 'bad' : 'info', detail: d.queueStrikes >= 2 ? 'turned off after repeated failures; songs reload the page instead' : 'available' },
      { label: 'Ads', status: 'info', detail: `${d.adsSeen} seen, playback resumed by the app ${d.recoveries} times` },
      { label: 'Player page visibility', status: 'info', detail: d.visibility },
      { label: 'Messages from the player', status: d.bridgeFailed ? 'bad' : 'ok', detail: d.bridgeFailed ? `${d.bridgeFailed} failed: ${d.bridgeLastError}` : `${d.bridgeOk} delivered` },
    );
  } else {
    rows.push({ label: 'Details from the player page', status: 'info', detail: 'arrive every few seconds once the player has loaded' });
  }

  const report = () => [
    `Youtube Music for Desktop ${version}`,
    `Window: ${navigator.userAgent}`,
    `Settings: startup=${settings.launchAtStartup} tray=${settings.closeToTray} mediaKeys=${settings.mediaKeys} overlay=${settings.mediaOverlay} discord=${settings.discordEnabled} shortcuts=${Object.keys(settings.keybinds).length}`,
    '',
    ...rows.map((r) => `[${word[r.status]}] ${r.label}${r.detail ? `: ${r.detail}` : ''}`),
    '',
    'Recent errors:',
    ...(recentErrors().length ? recentErrors() : ['none']),
  ].join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(report());
      notify('Report copied. Paste it wherever you’re getting help.');
    } catch {
      notify('Couldn’t copy automatically. Select the text in the panel and copy it.');
    }
  };

  return (
    <div className="diag">
      <ul>
        {rows.map((r) => (
          <li key={r.label}>
            <span className={`diag-badge ${r.status}`}>{word[r.status]}</span>
            <span className="diag-label">{r.label}</span>
            {r.detail && <span className="diag-detail">{r.detail}</span>}
          </li>
        ))}
      </ul>
      <button className="primary small" onClick={copy}>Copy report</button>
    </div>
  );
}
