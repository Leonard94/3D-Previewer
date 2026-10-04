import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { formatInt, plural } from '../../format.ts';
import { startCatalogSync, useCatalog } from '../../store/catalog.ts';
import { useScene } from '../../store/scene.ts';
import { useViewer } from '../../store/viewer.ts';
import { LIGHT_PRESETS } from '../../three/lightPresets.ts';
import { SceneCanvas } from '../../three/SceneCanvas.tsx';
import { HotkeysHelp } from '../Viewer/HotkeysHelp.tsx';
import { ShadingBar } from '../Viewer/ShadingBar.tsx';
import { useViewerHotkeys } from '../Viewer/useViewerHotkeys.ts';
import { Toast, ViewportHint } from '../Viewer/ViewerPage.tsx';
import '../Viewer/ViewerPage.css';
import { AddModelDialog } from './AddModelDialog.tsx';
import { PlusIcon } from './icons.tsx';
import { listenSceneRequests } from './bridge.ts';
import { ScenePanel } from './ScenePanel.tsx';
import { SelectionBar } from './SelectionBar.tsx';
import { SCENE_HOTKEYS, useSceneHotkeys } from './useSceneHotkeys.ts';
import './ScenePage.css';

/** Сцена: несколько моделей вместе — проверить масштаб и как они сочетаются. */
export function ScenePage() {
  const [adding, setAdding] = useState(false);
  const items = useScene((s) => s.items);
  const models = useCatalog((s) => s.models);
  const presetBg = useViewer((s) => LIGHT_PRESETS[s.lightPreset].background.color);

  useEffect(() => {
    startCatalogSync();
    document.title = 'Сцена';
  }, []);
  useViewerHotkeys();

  const openAdd = useCallback(() => setAdding(true), []);
  useSceneHotkeys(openAdd);

  // «Добавить в сцену» из инспектора: в открытую вкладку — сообщением, в новую — параметром ?add=.
  useEffect(
    () =>
      listenSceneRequests((id) => {
        useScene.getState().add(id);
        const title = useCatalog.getState().models[id]?.title ?? id;
        useViewer.getState().showToast(`Добавлена «${title}»`);
      }),
    [],
  );
  const [params, setParams] = useSearchParams();
  const handledAdd = useRef<string | null>(null);
  useEffect(() => {
    const id = params.get('add');
    if (!id || handledAdd.current === id) return;
    handledAdd.current = id;
    useScene.getState().add(id);
    setParams({}, { replace: true });
  }, [params, setParams]);

  const triangles = items.reduce((sum, i) => sum + (models[i.modelId]?.triangles ?? 0), 0);

  return (
    <div className="viewer">
      <div className="viewer__viewport" style={{ background: presetBg }}>
        <SceneCanvas />

        <div className="scene__tools">
          <button type="button" className="btn scene__add" onClick={() => setAdding(true)} data-hint="Shift+A, как в Blender">
            <PlusIcon /> Добавить модель
          </button>
          <SelectionBar />
        </div>

        <ShadingBar />

        {items.length === 0 && (
          <div className="viewer__center">
            <div className="scene__empty">
              <div className="section-title">Сцена пуста</div>
              <p className="muted">Добавьте модели — например, асфальт и мусорный бак — и посмотрите, как они смотрятся вместе.</p>
              <button type="button" className="btn primary" onClick={() => setAdding(true)}>
                <PlusIcon /> Добавить модель
              </button>
            </div>
          </div>
        )}

        <div className="viewer__overlay viewer__overlay--bottom">
          <ViewportHint />
          {items.length > 0 && (
            <div className="viewer__summary num">
              {items.length} {plural(items.length, ['модель', 'модели', 'моделей'])} · {formatInt(triangles)}{' '}
              {plural(triangles, ['треугольник', 'треугольника', 'треугольников'])}
            </div>
          )}
        </div>

        <Toast />
      </div>

      <ScenePanel onAdd={() => setAdding(true)} />
      <HotkeysHelp extra={{ title: 'Сцена', rows: SCENE_HOTKEYS }} />
      {adding && <AddModelDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
