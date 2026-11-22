export default function SignIn({ waiting, error, onStart }: { waiting: boolean; error?: string; onStart: () => void }) {
  return (
    <main className="signin">
      <div className="signin-logo" aria-hidden="true"><span /></div>
      <h1>Youtube Music</h1>
      <p>
        Sign in with your Google account to stream your playlists and Liked Music.
        Sign-in happens in a separate Google window, so this app never sees your password.
      </p>
      <button className="primary" onClick={onStart}>{waiting ? 'Reopen sign-in window' : 'Sign in with Google'}</button>
      {waiting && <p className="muted">Waiting for you to finish signing in…</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </main>
  );
}
