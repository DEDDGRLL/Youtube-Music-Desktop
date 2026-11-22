import { getVersion } from '@tauri-apps/api/app';
import { useEffect, useState, type ReactNode } from 'react';
import { windows } from '../lib/player';
import { comboFromEvent, getSettings, KEY_ACTIONS, prettyCombo, saveSettings, type Settings } from '../lib/settings';
import { checkForUpdate, installUpdate, openLink, type UpdateStatus } from '../lib/updates';
import Diagnostics from './Diagnostics';

function Row({ title, desc, checked, disabled, onChange }: {
  title: string; desc: ReactNode; checked: boolean; disabled?: boolean; onChange: (on: boolean) => void;
}) {
  return (
    <div className={`set-row ${disabled ? 'is-disabled' : ''}`}>
      <div className="set-text">
        <div className="set-title">{title}</div>
        <div className="set-desc">{desc}</div>
      </div>
      <button
        className="switch" role="switch" aria-checked={checked} aria-label={title} disabled={disabled}
        onClick={() => onChange(!checked)}
      ><span /></button>
    </div>
  );
}

/** Click, then press the keys to record a shortcut. Backspace clears it, Esc cancels. */
function KeyCapture({ value, onChange, onProblem }: { value: string; onChange: (combo: string) => void; onProblem: (message: string) => void }) {
  const [listening, setListening] = useState(false);

  useEffect(() => {
    if (!listening) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.code === 'Escape') { setListening(false); return; }
      if (e.code === 'Backspace' || e.code === 'Delete') { onChange(''); setListening(false); return; }
      const result = comboFromEvent(e);
      if (!result) return; // only modifiers held so far
      if (result.needsModifier) {
        onProblem('Include Ctrl, Alt or Shift, otherwise that key would stop working in every other app.');
        return;
      }
      onChange(result.combo);
      setListening(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listening, onChange, onProblem]);

  return (
    <div className="keycap-wrap">
      <button
        className={`keycap ${listening ? 'listening' : ''} ${value ? '' : 'empty'}`}
        onClick={() => setListening((l) => !l)} onBlur={() => setListening(false)}
        aria-label={listening ? 'Press the new shortcut' : value ? `Shortcut ${prettyCombo(value)}. Click to change` : 'No shortcut. Click to set'}
      >
        {listening ? 'Press keys…' : value ? prettyCombo(value) : 'Not set'}
      </button>
      <span className="keycap-slot">
        {value && !listening && <button className="keycap-clear" onClick={() => onChange('')} aria-label="Clear shortcut">Clear</button>}
      </span>
    </div>
  );
}

export default function SettingsView({ onSignOut }: { onSignOut: () => void }) {
  const [s, setS] = useState<Settings | null>(null);
  const [idDraft, setIdDraft] = useState('');
  const [version, setVersion] = useState('');
  const [error, setError] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [found, setFound] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    getSettings().then((v) => { setS(v); setIdDraft(v.discordClientId); }).catch((e) => setError(String(e)));
    getVersion().then(setVersion).catch(() => {});
  }, []);

  // Optimistic: show the change at once, then confirm with what the app actually saved.
  const update = async (patch: Partial<Settings>) => {
    if (!s) return;
    const previous = s;
    setS({ ...s, ...patch });
    setError('');
    setWarnings([]);
    try {
      const { settings, warnings: problems } = await saveSettings({ ...s, ...patch });
      setS(settings);
      setIdDraft(settings.discordClientId);
      setWarnings(problems);
    } catch (e) {
      setS(previous);
      setError(String((e as Error)?.message ?? e));
    }
  };

  const runCheck = async () => {
    setChecking(true);
    setFound(await checkForUpdate(version));
    setChecking(false);
  };
  const runInstall = async () => {
    setInstalling(true);
    try { await installUpdate(); } catch (e) { setError(String((e as Error)?.message ?? e)); setInstalling(false); }
  };

  if (!s) return <p className={error ? 'error' : 'muted'}>{error || 'Loading settings…'}</p>;
  const hasId = s.discordClientId.length > 0;

  return (
    <div className="settings">
      <h1>Settings</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {warnings.map((w) => <p className="error" role="alert" key={w}>{w}</p>)}

      <section className="set-section">
        <h2>General</h2>
        <Row
          title="Launch at startup" desc="Start Youtube Music when you sign in to Windows."
          checked={s.launchAtStartup} onChange={(on) => update({ launchAtStartup: on })}
        />
        <Row
          title="Start minimized" desc="When it starts with Windows, wait in the system tray instead of opening the window."
          checked={s.startMinimized} disabled={!s.launchAtStartup} onChange={(on) => update({ startMinimized: on })}
        />
        <Row
          title="Keep playing in the tray when closed" desc="Closing the window hides it and the music keeps playing. Turn off to quit when you close the window."
          checked={s.closeToTray} onChange={(on) => update({ closeToTray: on })}
        />
      </section>

      <section className="set-section">
        <h2>Playback</h2>
        <Row
          title="Media keys" desc="Use your keyboard's play/pause, next and previous keys, even when the app isn't focused."
          checked={s.mediaKeys} onChange={(on) => update({ mediaKeys: on })}
        />
        <Row
          title="Windows media overlay" desc="Show the song, artwork and controls in the Windows volume flyout and on the lock screen. Turn off if you see the song listed twice."
          checked={s.mediaOverlay} onChange={(on) => update({ mediaOverlay: on })}
        />
        <div className="set-row">
          <div className="set-text">
            <div className="set-title">Mini-player</div>
            <div className="set-desc">A small always-on-top window with the song and basic controls. You can also use the tray menu or assign a shortcut below.</div>
          </div>
          <button className="primary small" onClick={() => windows.toggleMini()}>Open</button>
        </div>
      </section>

      <section className="set-section">
        <h2>Keyboard shortcuts</h2>
        <p className="set-desc set-intro">
          These work everywhere, even when the app isn't focused. Click a shortcut, then press the keys you want. Backspace clears it and Esc cancels.
        </p>
        {KEY_ACTIONS.map((a) => (
          <div className="set-row" key={a.id}>
            <div className="set-title">{a.label}</div>
            <KeyCapture
              value={s.keybinds[a.id] ?? ''}
              onProblem={setError}
              onChange={(combo) => {
                const taken = combo && Object.entries(s.keybinds).find(([id, c]) => id !== a.id && c === combo);
                if (taken) {
                  setError(`${prettyCombo(combo)} is already used for “${KEY_ACTIONS.find((x) => x.id === taken[0])?.label}”.`);
                  return;
                }
                const next = { ...s.keybinds };
                if (combo) next[a.id] = combo; else delete next[a.id];
                update({ keybinds: next });
              }}
            />
          </div>
        ))}
      </section>

      <section className="set-section">
        <h2>Discord</h2>
        <Row
          title="Show what I'm listening to"
          desc={hasId ? 'Shows the song, artist, artwork and progress on your Discord profile.' : 'Add your Discord Application ID below to turn this on.'}
          checked={s.discordEnabled} disabled={!hasId} onChange={(on) => update({ discordEnabled: on })}
        />
        <div className="set-field">
          <label htmlFor="discord-id" className="set-title">Discord Application ID</label>
          <div className="set-input-row">
            <input
              id="discord-id" inputMode="numeric" autoComplete="off" spellCheck={false}
              value={idDraft} placeholder="e.g. 123456789012345678"
              onChange={(e) => setIdDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') update({ discordClientId: idDraft.trim() }); }}
            />
            <button className="primary small" disabled={idDraft.trim() === s.discordClientId} onClick={() => update({ discordClientId: idDraft.trim() })}>
              Save
            </button>
          </div>
          <ol className="set-help">
            <li>Go to <button className="inline-link" onClick={() => openLink('https://discord.com/developers/applications')}>discord.com/developers/applications</button> and create a new application.</li>
            <li>Name it <b>Youtube Music</b>. Discord shows this name as "Listening to Youtube Music".</li>
            <li>Copy the <b>Application ID</b> from the General Information page and paste it above.</li>
          </ol>
          <p className="set-desc">
            Discord must be running on this computer. If nothing appears, check that activity sharing is on in Discord under Settings, then Activity Privacy.
          </p>
        </div>
      </section>

      <section className="set-section">
        <h2>Account</h2>
        <div className="set-row">
          <div className="set-text">
            <div className="set-title">Sign out</div>
            <div className="set-desc">Signs you out of Google in this app and clears its saved session.</div>
          </div>
          <button className="primary small" onClick={onSignOut}>Sign out</button>
        </div>
      </section>

      <section className="set-section">
        <h2>Updates</h2>
        <Row
          title="Check for updates on startup" desc="Looks for a newer version on GitHub when the app opens and lets you know."
          checked={s.checkUpdates} onChange={(on) => update({ checkUpdates: on })}
        />
        <div className="set-row">
          <div className="set-text">
            <div className="set-title">{version ? `Version ${version}` : 'Version'}</div>
            <div className="set-desc" role="status">
              {checking ? 'Checking…'
                : !found ? 'Press the button to look for a newer version.'
                : found.kind === 'latest' ? 'You have the latest version.'
                : found.kind === 'error' ? `Couldn’t check: ${found.message}`
                : `Version ${found.version} is available.${found.installable ? '' : ' Download it from GitHub and run the installer.'}`}
            </div>
          </div>
          {found?.kind === 'available' && found.installable
            ? <button className="primary small" disabled={installing} onClick={runInstall}>{installing ? 'Installing…' : 'Install and restart'}</button>
            : found?.kind === 'available' && found.url
              ? <button className="primary small" onClick={() => openLink(found.url!)}>Download</button>
              : <button className="primary small" disabled={checking || !version} onClick={runCheck}>Check now</button>}
        </div>
      </section>

      <section className="set-section">
        <h2>Diagnostics</h2>
        <details className="set-details">
          <summary>Show what the app can see of the player</summary>
          <Diagnostics settings={s} version={version} />
        </details>
      </section>

      <section className="set-section">
        <h2>About</h2>
        <p className="set-desc">
          Youtube Music for Desktop{version && ` ${version}`}. An unofficial app, not affiliated with Google or YouTube.
        </p>
      </section>
    </div>
  );
}
