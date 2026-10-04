import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { ModelDetails } from '../../../../shared/types.ts';
import { ApiRequestError, api, modelFileUrl } from '../../api/client.ts';
import { subscribeConnection, subscribeEvents } from '../../api/events.ts';
import { formatInt, plural, textureSizeLabel } from '../../format.ts';
import { useViewer } from '../../store/viewer.ts';
import { LIGHT_PRESETS } from '../../three/lightPresets.ts';
import { ViewerCanvas, type LoadState } from '../../three/ViewerCanvas.tsx';
import { HotkeysHelp } from './HotkeysHelp.tsx';
import { ShadingBar } from './ShadingBar.tsx';
import { ViewerPanel } from './ViewerPanel.tsx';
import { useViewerHotkeys } from './useViewerHotkeys.ts';
import './ViewerPage.css';

export function ViewerPage() {
  const [params] = useSearchParams();
  const id = params.get('model') ?? '';
  const [model, setModel] = useState<ModelDetails | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: 'loading', progress: null });

  useEffect(() => {
    if (!id) {
      setFetchError('Не указана модель');
      return;
    }
    let cancelled = false;
    api.getModel(id).then(
      (m) => {
        if (cancelled) return;
        setModel(m);
        document.title = m.title;
      },
      (err: unknown) => {
        if (cancelled) return;
        setFetchError(err instanceof ApiRequestError && err.status === 404 ? 'Модель не найдена' : String((err as Error).message));
        document.title = 'Модель не найдена';
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Горячая перезагрузка. Новый хеш (переэкспорт) — перезагрузить анализ и .glb, сохранив ракурс,
  // свет, влажность, переключатели, режим и скрытые объекты (по именам). Тот же хеш (изменился только
  // .blend) — обновить предупреждения без перезагрузки модели.
  const [removed, setRemoved] = useState(false);
  const hashRef = useRef<string | null>(null);
  hashRef.current = model?.hash ?? null;
  const toastOnReady = useRef(false);
  useEffect(() => {
    if (!id) return;
    const refresh = () =>
      api.getModel(id).then(
        (m) => {
          setRemoved(false);
          if (m.hash !== hashRef.current) {
            toastOnReady.current = hashRef.current !== null;
            useViewer.getState().keepObjects(new Set(m.objects.map((o) => o.name)));
          }
          setModel(m);
          document.title = m.title;
        },
        (err: unknown) => {
          if (err instanceof ApiRequestError && err.status === 404) setRemoved(true);
        },
      );
    const offEvents = subscribeEvents((e) => {
      if (e.id !== id) return;
      if (e.type === 'removed') setRemoved(true);
      else if (e.type === 'changed' || e.type === 'added') void refresh();
    });
    // После переподключения события за время разрыва потеряны — перечитать модель.
    let wasConnected = true;
    const offConnection = subscribeConnection((connected) => {
      if (connected && !wasConnected) void refresh();
      wasConnected = connected;
    });
    return () => {
      offEvents();
      offConnection();
    };
  }, [id]);

  useViewerHotkeys();
  // Новая вкладка — всегда с «Общего» вида.
  useEffect(() => useViewer.setState({ activeView: 'general' }), [id]);

  // Индикатор загрузки — только при первом открытии; при перезагрузке старая модель остаётся на экране.
  const [everReady, setEverReady] = useState(false);
  const onLoadState = useCallback((s: LoadState) => {
    setLoad(s);
    if (s.status !== 'ready') return;
    setEverReady(true);
    if (toastOnReady.current) {
      toastOnReady.current = false;
      useViewer.getState().showToast('Модель обновлена');
    }
  }, []);
  const presetBg = useViewer((s) => LIGHT_PRESETS[s.lightPreset].background.color);

  if (fetchError) {
    return (
      <div className="viewer-message">
        <div className="section-title">{fetchError}</div>
        <p className="mono muted">{id}</p>
        <Link to="/" className="btn">
          ← В каталог
        </Link>
      </div>
    );
  }

  const broken = model?.analysisError;

  return (
    <div className="viewer">
      <div className="viewer__viewport" style={{ background: presetBg }}>
        {model && !broken && (
          <ViewerCanvas url={modelFileUrl(model.id, model.hash)} objects={model.objects} title={model.title} onLoadState={onLoadState} />
        )}

        {model && (
          <div className="viewer__overlay viewer__overlay--top">
            <div className="viewer__crumb">
              {model.category && <span className="muted">{model.category.toUpperCase()} / </span>}
              {model.title.toUpperCase()}
            </div>
            {model.tags.length > 0 && (
              <div className="viewer__tags">
                {model.tags.map((t) => (
                  <span key={t} className="viewer__tag">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {model && !broken && <ShadingBar />}

        <div className="viewer__overlay viewer__overlay--bottom">
          <div className="viewer__hint">
            ЛКМ — вращение · колесо — масштаб · ПКМ — сдвиг · двойной клик — приблизить ·{' '}
            <button type="button" className="viewer__hotkeys-btn" onClick={() => useViewer.getState().setHotkeysOpen(true)}>
              <kbd className="kbd">?</kbd> горячие клавиши
            </button>
          </div>
          {model?.triangles != null && (
            <div className="viewer__summary num">
              {formatInt(model.triangles)} {plural(model.triangles, ['треугольник', 'треугольника', 'треугольников'])}
              {model.maxTextureSize != null && ` · карты ${textureSizeLabel(model.maxTextureSize)}`}
            </div>
          )}
        </div>

        {(broken || load.status === 'error') && (
          <div className="viewer__center">
            <div className="viewer__error">
              <div className="section-title">Модель не открывается</div>
              <p>{broken ?? (load.status === 'error' ? load.message : '')}</p>
            </div>
          </div>
        )}
        {!broken && load.status === 'loading' && !everReady && (
          <div className="viewer__center">
            <div className="viewer__loading">
              <span>Загрузка модели…</span>
              <span className="viewer__progress">
                <span
                  className={`viewer__progress-bar${load.progress === null ? ' indeterminate' : ''}`}
                  style={load.progress === null ? undefined : { width: `${Math.round(load.progress * 100)}%` }}
                />
              </span>
            </div>
          </div>
        )}

        {removed && (
          <div className="viewer__center viewer__center--blocking">
            <div className="viewer__error">
              <div className="section-title">Файл удалён или переименован</div>
              <p className="mono muted">{id}</p>
              <Link to="/" className="btn">
                ← В каталог
              </Link>
            </div>
          </div>
        )}

        <Toast />
      </div>

      <ViewerPanel model={model} />
      <HotkeysHelp />
    </div>
  );
}

const TOAST_MS = 2500;

function Toast() {
  const toast = useViewer((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className={`viewer__toast${visible ? ' visible' : ''}`} role="status">
      {toast.text}
    </div>
  );
}
