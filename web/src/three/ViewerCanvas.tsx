import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import type { ObjectInfo } from '../../../shared/types.ts';
import { useViewer } from '../store/viewer.ts';
import { computeBounds, type ModelBounds } from './bounds.ts';
import { CameraRig } from './CameraRig.tsx';
import { Dimensions } from './Dimensions.tsx';
import { applyDisplayMode } from './displayModes.ts';
import { Floor } from './Floor.tsx';
import { Grid } from './Grid.tsx';
import { setHighlight } from './highlight.ts';
import { Lighting } from './Lighting.tsx';
import { LIGHT_PRESETS } from './lightPresets.ts';
import { disposeGltfLoader, loadGltf } from './loader.ts';
import { Mannequin } from './Mannequin.tsx';
import { collectMeshes, disposeModel, indexObjects, objectBox } from './objects.ts';
import { Screenshot } from './Screenshot.tsx';
import { SelectionOutline } from './SelectionOutline.tsx';
import { CAMERA_FOV } from './views.ts';
import { applyWetness, prepareWetness } from './wetness.ts';
import { applyMeshState } from './wireframe.ts';

export type LoadState =
  | { status: 'loading'; progress: number | null }
  | { status: 'ready' }
  | { status: 'error'; message: string };

interface Props {
  /** URL .glb; смена URL — перезагрузка модели (камера и настройки сохраняются). */
  url: string;
  /** Объекты из анализа — для связи имён со сценой (по индексу узла glTF). */
  objects: ObjectInfo[];
  /** Название модели — для имени файла скриншота. */
  title: string;
  onLoadState: (state: LoadState) => void;
}

interface Loaded {
  model: THREE.Object3D;
  bounds: ModelBounds;
  /** Меши модели без вспомогательных (каркас, подсветка). */
  meshes: THREE.Mesh[];
  /** Имя объекта → его меши. */
  byName: Map<string, THREE.Mesh[]>;
}

/** Сцена вьювера: модель, пол, сетка, свет, камера и вспомогательные элементы. */
export function ViewerCanvas({ url, objects, title, onLoadState }: Props) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const mannequin = useViewer((s) => s.mannequin);
  const dimensions = useViewer((s) => s.dimensions);
  const objectBounds = useCallback(
    (name: string) => {
      const meshes = loaded?.byName.get(name);
      return meshes ? objectBox(meshes) : null;
    },
    [loaded],
  );

  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      frameloop="demand"
      gl={{ antialias: true, toneMapping: THREE.AgXToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
      camera={{ fov: CAMERA_FOV, near: 0.01, far: 1000, position: [3, 2, 3] }}
    >
      <ModelLoader url={url} objects={objects} onLoaded={setLoaded} onLoadState={onLoadState} />
      {loaded && (
        <>
          <SceneLighting bounds={loaded.bounds} />
          <Turntable bounds={loaded.bounds}>
            <primitive object={loaded.model} />
            {dimensions && <Dimensions bounds={loaded.bounds} />}
          </Turntable>
          {mannequin && <Mannequin bounds={loaded.bounds} />}
          <ModelEffects loaded={loaded} />
          <ObjectEffects loaded={loaded} />
          <CameraRig bounds={loaded.bounds} target={loaded.model} objectBounds={objectBounds} />
          <Screenshot title={title} />
        </>
      )}
    </Canvas>
  );
}

/** Загружает .glb (нужен рендерер — для KTX2), освобождает предыдущую модель. */
function ModelLoader({
  url,
  objects,
  onLoaded,
  onLoadState,
}: {
  url: string;
  objects: ObjectInfo[];
  onLoaded: (l: Loaded | null) => void;
  onLoadState: (s: LoadState) => void;
}) {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const current = useRef<Loaded | null>(null);
  const firstLoad = useRef(true);
  // Объекты берутся те, что были актуальны в момент смены URL: анализ и .glb меняются вместе.
  const objectsRef = useRef(objects);
  objectsRef.current = objects;

  useEffect(() => {
    let cancelled = false;
    const info = objectsRef.current;
    onLoadState({ status: 'loading', progress: null });
    loadGltf(gl, url, (progress) => !cancelled && onLoadState({ status: 'loading', progress })).then(
      (gltf) => {
        const model = gltf.scene;
        const meshes = collectMeshes(model);
        if (cancelled) {
          disposeModel(model, meshes);
          return;
        }
        for (const m of meshes) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
        prepareWetness(meshes);
        const index = indexObjects(gltf);
        const byName = new Map<string, THREE.Mesh[]>();
        for (const o of info) {
          const found = index.get(o.nodeIndex);
          if (found) byName.set(o.name, [...(byName.get(o.name) ?? []), ...found.meshes]);
        }
        const prev = current.current;
        const next: Loaded = { model, bounds: computeBounds(model), meshes, byName };
        current.current = next;
        onLoaded(next);
        if (prev) disposeModel(prev.model, prev.meshes);
        if (firstLoad.current) {
          firstLoad.current = false;
          useViewer.getState().setView('general', { instant: true });
        }
        onLoadState({ status: 'ready' });
        invalidate();
      },
      (err: unknown) => {
        if (cancelled) return;
        console.error(err);
        onLoadState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [url, gl, invalidate, onLoaded, onLoadState]);

  // Уход со страницы: освободить модель и воркеры декодеров.
  useEffect(
    () => () => {
      if (current.current) disposeModel(current.current.model, current.current.meshes);
      current.current = null;
      disposeGltfLoader();
    },
    [],
  );

  return null;
}

const onHdriStatus = (url: string, ok: boolean) => useViewer.getState().setHdriMissing(url, !ok);

/** Свет, пол и сетка по выбранному пресету (общему для всех моделей). */
export function SceneLighting({ bounds }: { bounds: ModelBounds }) {
  const presetId = useViewer((s) => s.lightPreset);
  const envBackground = useViewer((s) => s.envBackground);
  const grid = useViewer((s) => s.grid);
  const shadows = useViewer((s) => s.shadows);
  const invalidate = useThree((s) => s.invalidate);
  const preset = LIGHT_PRESETS[presetId];
  useEffect(() => invalidate(), [grid, presetId, invalidate]);
  return (
    <>
      <Lighting preset={preset} bounds={bounds} envBackground={envBackground} shadows={shadows} onHdriStatus={onHdriStatus} />
      {shadows && <Floor bounds={bounds} opacity={preset.shadow.opacity} />}
      {grid && <Grid bounds={bounds} style={preset.grid} />}
    </>
  );
}

/** Один оборот вращения, с. */
const TURNTABLE_PERIOD = 12;
/** Скорость возврата к исходному повороту (λ для damp): ~0,5 с. */
const TURNTABLE_RETURN_LAMBDA = 8;
const TWO_PI = Math.PI * 2;

/**
 * Вращение модели вокруг вертикальной оси через центр AABB. Свет и камера неподвижны.
 * Выключение — пауза на текущем угле; виды и «Вписать» плавно возвращают исходный поворот,
 * чтобы кадр совпадал с габаритами модели.
 */
export function Turntable({ bounds, children }: { bounds: ModelBounds; children: ReactNode }) {
  const rotate = useViewer((s) => s.rotate);
  const command = useViewer((s) => s.command);
  const invalidate = useThree((s) => s.invalidate);
  const pivot = useRef<THREE.Group>(null);
  const returning = useRef(false);

  useEffect(() => {
    returning.current = false;
    invalidate();
  }, [rotate, invalidate]);

  useEffect(() => {
    if (command && command.kind !== 'focus' && !useViewer.getState().rotate) {
      returning.current = true;
      invalidate();
    }
  }, [command, invalidate]);

  useFrame((_, delta) => {
    const g = pivot.current;
    if (!g) return;
    // После неактивной вкладки delta бывает огромной — без рывка.
    const dt = Math.min(delta, 0.1);
    if (rotate) {
      g.rotation.y = (g.rotation.y + (dt * TWO_PI) / TURNTABLE_PERIOD) % TWO_PI;
      invalidate();
    } else if (returning.current) {
      // Кратчайшим путём к 0.
      const a = THREE.MathUtils.euclideanModulo(g.rotation.y + Math.PI, TWO_PI) - Math.PI;
      const next = THREE.MathUtils.damp(a, 0, TURNTABLE_RETURN_LAMBDA, dt);
      if (Math.abs(next) < 1e-4) {
        g.rotation.y = 0;
        returning.current = false;
      } else {
        g.rotation.y = next;
      }
      invalidate();
    }
  });

  const { x, z } = bounds.center;
  return (
    <group position={[x, 0, z]}>
      <group ref={pivot}>
        <group position={[-x, 0, -z]}>{children}</group>
      </group>
    </group>
  );
}

/** Меши, которые сейчас скрыты: изоляция показывает только один объект, иначе — скрытые «глазом». */
function useHiddenMeshes(loaded: Loaded): Set<THREE.Mesh> {
  const hidden = useViewer((s) => s.hidden);
  const isolated = useViewer((s) => s.isolated);
  return useMemo(() => {
    if (isolated && loaded.byName.has(isolated)) {
      const keep = new Set(loaded.byName.get(isolated));
      return new Set(loaded.meshes.filter((m) => !keep.has(m)));
    }
    return new Set(hidden.flatMap((name) => loaded.byName.get(name) ?? []));
  }, [loaded, hidden, isolated]);
}

/** Режим отображения, влажность, каркас и видимость объектов. Порядок эффектов важен. */
function ModelEffects({ loaded }: { loaded: Loaded }) {
  const displayMode = useViewer((s) => s.displayMode);
  const wetness = useViewer((s) => s.wetness);
  const wireframe = useViewer((s) => s.wireframe);
  const wireColor = useViewer((s) => LIGHT_PRESETS[s.lightPreset].wireframeColor);
  const hidden = useHiddenMeshes(loaded);
  const invalidate = useThree((s) => s.invalidate);
  const { model, meshes } = loaded;

  useLayoutEffect(() => {
    applyDisplayMode(meshes, displayMode);
    invalidate();
  }, [meshes, displayMode, invalidate]);

  // Влажность меняет исходные материалы — в режимах отображения её не видно.
  useLayoutEffect(() => {
    applyWetness(meshes, wetness / 100);
    invalidate();
  }, [meshes, wetness, invalidate]);

  // После смены режима: polygonOffset для каркаса ставится на материалы, которые сейчас на мешах.
  useLayoutEffect(() => {
    applyMeshState(model, meshes, wireframe, wireColor, hidden);
    invalidate();
  }, [model, meshes, wireframe, wireColor, hidden, displayMode, invalidate]);

  return null;
}

/** Подсветка при наведении и обводка выделенного объекта. */
function ObjectEffects({ loaded }: { loaded: Loaded }) {
  const hovered = useViewer((s) => s.hovered);
  const selected = useViewer((s) => s.selected);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    setHighlight(loaded.meshes, new Set(hovered ? (loaded.byName.get(hovered) ?? []) : []));
    invalidate();
  }, [loaded, hovered, invalidate]);

  const outlined = useMemo(() => (selected ? (loaded.byName.get(selected) ?? []) : []), [loaded, selected]);
  return outlined.length > 0 ? <SelectionOutline objects={outlined} /> : null;
}
