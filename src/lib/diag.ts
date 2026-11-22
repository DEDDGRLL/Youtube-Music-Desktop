/** A small log of recent problems in the app itself, included in the diagnostics report. */

const errors: string[] = [];
const keep = (kind: string, e: unknown) => {
  const text = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  errors.push(`${new Date().toISOString()} ${kind}: ${text}`.slice(0, 300));
  if (errors.length > 20) errors.shift();
};

export function startErrorLog() {
  window.addEventListener('error', (e) => keep('error', e.error ?? e.message));
  window.addEventListener('unhandledrejection', (e) => keep('unhandled rejection', e.reason));
}

export const recentErrors = () => [...errors];
