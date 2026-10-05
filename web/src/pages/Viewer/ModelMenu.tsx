import { useCallback, useRef, useState } from 'react';
import type { ModelDetails } from '../../../../shared/types.ts';
import { api } from '../../api/client.ts';
import { CopyButton } from '../../components/ui.tsx';
import { useDismiss } from '../../components/useDismiss.ts';
import { useViewer } from '../../store/viewer.ts';

const IS_MAC = /Mac/i.test(navigator.platform || navigator.userAgent);

/** Шестерёнка у названия модели: пути к файлам и действия с ними — чтобы не занимать место в панели. */
export function ModelMenu({ model }: { model: ModelDetails }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, rootRef, close);

  const run = (action: () => Promise<void>) => {
    close();
    action().catch((err: unknown) => useViewer.getState().showToast((err as Error).message));
  };

  return (
    <div className="model-menu" ref={rootRef}>
      <button
        type="button"
        className={`model-menu__btn${open ? ' active' : ''}`}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Файлы и действия"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
          <circle cx="8" cy="8" r="2.2" />
          <path
            d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2M3.4 3.4l1.4 1.4M11.2 11.2l1.4 1.4M3.4 12.6l1.4-1.4M11.2 4.8l1.4-1.4"
            strokeLinecap="round"
          />
          <circle cx="8" cy="8" r="4.6" />
        </svg>
      </button>
      {open && (
        <div className="model-menu__pop">
          <div className="model-menu__paths">
            <PathRow label=".glb" path={model.glbPath} />
            <PathRow label=".blend" path={model.blendPath} />
          </div>
          <div className="model-menu__items">
            <button type="button" className="model-menu__item" onClick={() => run(() => api.reveal(model.id))}>
              {IS_MAC ? 'Показать в Finder' : 'Показать в папке'}
            </button>
            {model.blendFile && (
              <button type="button" className="model-menu__item" onClick={() => run(() => api.openBlend(model.id))}>
                Открыть в Blender
              </button>
            )}
            <button
              type="button"
              className="model-menu__item"
              onClick={() => run(async () => useViewer.getState().requestScreenshot())}
              disabled={Boolean(model.analysisError)}
            >
              Скриншот <span className="muted">PNG текущего кадра в 2×</span>
              <kbd className="kbd">P</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PathRow({ label, path }: { label: string; path: string | null }) {
  return (
    <div className="path-row">
      <span className="path-row__label">{label}</span>
      {path ? (
        <>
          <span className="mono path-row__path" title={path}>
            {'‎' + path + '‎'}
          </span>
          <CopyButton text={path} />
        </>
      ) : (
        <span className="muted path-row__path">исходник не найден</span>
      )}
    </div>
  );
}
