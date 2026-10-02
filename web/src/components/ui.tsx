import { useState, type ReactNode } from 'react';
import './ui.css';

/** Секция панели с заголовком капсом; может сворачиваться. */
export function Section({
  title,
  children,
  defaultOpen = true,
  open: controlledOpen,
  onToggle,
  aside,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onToggle?: (open: boolean) => void;
  aside?: ReactNode;
}) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const open = controlledOpen ?? innerOpen;
  const toggle = () => {
    setInnerOpen(!open);
    onToggle?.(!open);
  };
  return (
    <section className={`panel-section${open ? ' open' : ''}`}>
      <button type="button" className="panel-section__head" onClick={toggle} aria-expanded={open}>
        <span className="section-title">{title}</span>
        {aside && <span className="panel-section__aside">{aside}</span>}
        <svg className="panel-section__chevron" viewBox="0 0 12 12" width="12" height="12" aria-hidden>
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && <div className="panel-section__body">{children}</div>}
    </section>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <label className="toggle" data-hint={hint}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle__track" aria-hidden>
        <span className="toggle__thumb" />
      </span>
      <span>{label}</span>
    </label>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn--small"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? 'Скопировано' : 'Копировать'}
    </button>
  );
}
