import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Toggle } from '../../components/ui.tsx';
import { useDismiss } from '../../components/useDismiss.ts';
import { useViewer, type Shading } from '../../store/viewer.ts';
import { DISPLAY_MODE_HINTS, DISPLAY_MODE_LABELS } from '../../three/displayModes.ts';

const SHADINGS: Shading[] = ['wireframe', 'color', 'normal', 'normals', 'uv'];

const LABELS: Record<Shading, string> = { wireframe: 'Каркас', ...DISPLAY_MODE_LABELS };
const HINTS: Record<Shading, string> = { wireframe: 'Только рёбра, без поверхностей', ...DISPLAY_MODE_HINTS };

const ICONS: Record<Shading, ReactNode> = {
  wireframe: (
    <>
      <circle cx="8" cy="8" r="6" />
      <ellipse cx="8" cy="8" rx="2.6" ry="6" />
      <path d="M2 8h12" />
    </>
  ),
  color: <circle cx="8" cy="8" r="6" fill="currentColor" />,
  normal: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" stroke="none" />
    </>
  ),
  normals: (
    <>
      <path d="M2 13.5h12" />
      <path d="M4 13V6.5M8 13V3.5M12 13V6.5M2.8 7.7 4 6.5l1.2 1.2M6.8 4.7 8 3.5l1.2 1.2M10.8 7.7 12 6.5l1.2 1.2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  uv: (
    <>
      <rect x="2" y="2" width="12" height="12" rx="1.5" />
      <path d="M2 2h6v6H2zM8 8h6v6H8z" fill="currentColor" stroke="none" />
    </>
  ),
};

/** Переключатель затенения в углу вьюпорта — как шапка вьюпорта Blender: режимы и ▾ с настройками. */
export function ShadingBar() {
  const shading = useViewer((s) => s.shading);
  const setShading = useViewer((s) => s.setShading);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  useDismiss(open, rootRef, useCallback(() => setOpen(false), []));

  return (
    <div className="shading" ref={rootRef}>
      <div className="shading__group" role="radiogroup" aria-label="Затенение">
        {SHADINGS.map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={shading === m}
            aria-label={LABELS[m]}
            className={`shading__btn${shading === m ? ' active' : ''}`}
            onClick={() => setShading(m)}
            data-hint={`${LABELS[m]}\n${HINTS[m]}`}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
              {ICONS[m]}
            </svg>
          </button>
        ))}
      </div>
      <button
        type="button"
        className={`shading__btn shading__more${open ? ' active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Настройки затенения"
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden>
          <path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && <ShadingPopover />}
    </div>
  );
}

function ShadingPopover() {
  const shading = useViewer((s) => s.shading);
  const wireOverlay = useViewer((s) => s.wireOverlay);
  const setWireOverlay = useViewer((s) => s.setWireOverlay);
  return (
    <div className="shading__pop">
      <div className="section-title">{LABELS[shading]}</div>
      <p className="shading__note muted">{HINTS[shading]}</p>
      <Toggle label="Каркас поверх модели" checked={wireOverlay} onChange={setWireOverlay} />
      {shading === 'wireframe' && <p className="shading__note muted">Сработает, когда выйдете из режима «Каркас».</p>}
      <p className="shading__foot muted">
        <kbd className="kbd">W</kbd> по кругу: нет → поверх модели → только каркас
      </p>
    </div>
  );
}
