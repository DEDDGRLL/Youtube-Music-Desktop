import { useState } from 'react';
import { validateToken } from '../lib/listenbrainz';
import { flushQueue, pendingCount, prefs } from '../lib/listening';
import { openLink } from '../lib/updates';
import Row from './SettingsRow';

/** Settings for the listening history and sending plays to ListenBrainz. */
export default function ListeningSettings() {
  const [historyOn, setHistoryOn] = useState(prefs.historyOn());
  const [token, setToken] = useState(prefs.token());
  const [user, setUser] = useState(prefs.user());
  const [sending, setSending] = useState(prefs.scrobbleOn());
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(pendingCount());
  const connected = !!token;

  const connect = async () => {
    const value = draft.trim();
    if (!value) return;
    setBusy(true);
    setError('');
    const result = await validateToken(value);
    setBusy(false);
    if (!result.valid) { setError(result.message); return; }
    prefs.connect(value, result.user ?? '');
    setToken(value);
    setUser(result.user ?? '');
    setSending(true);
    setDraft('');
    void flushQueue().then(() => setPending(pendingCount()));
  };

  const disconnect = () => {
    prefs.disconnect();
    setToken('');
    setUser('');
    setSending(false);
    setPending(0);
  };

  return (
    <section className="set-section">
      <h2>Listening history</h2>
      <Row
        title="Keep a listening history"
        desc="Records the songs you listen to (at least half of a song, or 4 minutes) on this computer, for the History page. Nothing leaves your computer."
        checked={historyOn} onChange={(on) => { prefs.setHistoryOn(on); setHistoryOn(on); }}
      />
      <Row
        title="Send plays to ListenBrainz"
        desc={connected ? `Connected as ${user || 'your account'}. Plays you listen to are sent there as you go${pending ? `, and ${pending} are waiting to be sent` : ''}.` : 'Connect your ListenBrainz account below to turn this on.'}
        checked={sending} disabled={!connected}
        onChange={(on) => { prefs.setScrobbleOn(on); setSending(on); if (on) void flushQueue().then(() => setPending(pendingCount())); }}
      />
      <div className="set-field">
        {connected ? (
          <div className="set-input-row">
            <span className="set-desc">Signed in to ListenBrainz{user ? ` as ${user}` : ''}.</span>
            <button className="ghost small-ghost" onClick={disconnect}>Disconnect</button>
          </div>
        ) : (
          <>
            <label htmlFor="lb-token" className="set-title">ListenBrainz user token</label>
            <div className="set-input-row">
              <input
                id="lb-token" type="password" autoComplete="off" spellCheck={false} value={draft}
                placeholder="Paste your token" onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') connect(); }}
              />
              <button className="primary small" disabled={!draft.trim() || busy} onClick={connect}>{busy ? 'Checking…' : 'Connect'}</button>
            </div>
            {error && <p className="error" role="alert">{error}</p>}
            <p className="set-desc">
              Find your token at <button className="inline-link" onClick={() => openLink('https://listenbrainz.org/settings/')}>listenbrainz.org/settings</button> after signing in. It stays on this computer.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
