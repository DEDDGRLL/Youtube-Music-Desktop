import { invoke } from '@tauri-apps/api/core';

export interface Settings {
  launchAtStartup: boolean;
  startMinimized: boolean;
  closeToTray: boolean;
  mediaKeys: boolean;
  discordEnabled: boolean;
  discordClientId: string;
  checkUpdates: boolean;
  mediaOverlay: boolean;
  /** action -> key combo, e.g. { playPause: "Ctrl+Alt+Space" } */
  keybinds: Record<string, string>;
}

export interface SaveResult {
  settings: Settings;
  /** Things that couldn't be applied, e.g. a shortcut another app already owns. */
  warnings: string[];
}

export const getSettings = () => invoke<Settings>('get_settings');
/** Saves and applies the settings; resolves with what was actually stored. */
export const saveSettings = (settings: Settings) => invoke<SaveResult>('set_settings', { settings });

/** The actions that can have a global shortcut, in display order. */
export const KEY_ACTIONS: { id: string; label: string }[] = [
  { id: 'playPause', label: 'Play / pause' },
  { id: 'next', label: 'Next song' },
  { id: 'previous', label: 'Previous song' },
  { id: 'volumeUp', label: 'Volume up' },
  { id: 'volumeDown', label: 'Volume down' },
  { id: 'shuffle', label: 'Toggle shuffle' },
  { id: 'repeat', label: 'Cycle repeat' },
  { id: 'showWindow', label: 'Show or hide the window' },
  { id: 'toggleMini', label: 'Show or hide the mini-player' },
];

const PRETTY: Record<string, string> = {
  ArrowLeft: 'Left', ArrowRight: 'Right', ArrowUp: 'Up', ArrowDown: 'Down', Space: 'Space', Backquote: '`',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
};

/** "Ctrl+Alt+KeyA" -> "Ctrl + Alt + A" */
export function prettyCombo(combo: string): string {
  return combo
    .split('+')
    .map((p) => PRETTY[p] ?? p.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num '))
    .join(' + ');
}

const MODIFIER_CODES = /^(Control|Shift|Alt|Meta|OS)(Left|Right)?$/;

/**
 * Turn a key press into a combo string the Rust side understands, or null while only modifiers are held.
 * `needsModifier` is true for ordinary keys: a global shortcut on a bare letter would steal it from every app.
 */
export function comboFromEvent(e: KeyboardEvent): { combo: string; needsModifier: boolean } | null {
  if (MODIFIER_CODES.test(e.code)) return null;
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  if (e.metaKey) parts.push('Super');
  parts.push(e.code);
  const standalone = /^(F\d{1,2}|Media.*|Audio.*|Pause|PrintScreen|ScrollLock)$/.test(e.code);
  return { combo: parts.join('+'), needsModifier: !standalone && parts.length === 1 };
}
