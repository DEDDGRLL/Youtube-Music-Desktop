import type { ReactNode } from 'react';

/** One setting: a title, a description, and an on/off switch. */
export default function Row({ title, desc, checked, disabled, onChange }: {
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
