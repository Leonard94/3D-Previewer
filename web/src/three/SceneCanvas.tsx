import { TransformControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import type { TransformControls as TransformControlsImpl } from 'three-stdlib';
import type { Vec3 } from '../../../shared/types.ts';
import { useCatalog } from '../store/catalog.ts';
import { useScene } from '../store/scene.ts';
import { useViewer } from '../store/viewer.ts';
import { CameraRig } from './CameraRig.tsx';
import { Dimensions } from './Dimensions.tsx';
import { applyDisplayMode } from './displayModes.ts';
import { LIGHT_PRESETS } from './lightPresets.ts';
import { disposeGltfLoader } from './loader.ts';
import { Mannequin } from './Mannequin.tsx';
import { objectBox } from './objects.ts';
import { EMPTY_BOUNDS, SceneStage, type SceneInstance, type StageSnapshot } from './sceneStage.ts';
import { Screenshot } from './Screenshot.tsx';
import { SelectionOutline } from './SelectionOutline.tsx';
import { SceneLighting, Turntable } from './ViewerCanvas.tsx';
import { CAMERA_FOV } from './views.ts';
import { applyWetness } from './wetness.ts';
import { applyMeshState, HIDDEN_SURFACE_LAYER } from './wireframe.ts';

const EMPTY_SNAPSHOT: StageSnapshot = { instances: [], bounds: EMPTY_BOUNDS, status: {} };
const NO_HIDDEN = new Set<THREE.Mesh>();

/** Привязка гизмо (без Shift): шаг перемещения, м, и поворота, рад. */
const MOVE_STEP = 0.1;
const ROTATE_STEP = THREE.MathUtils.degToRad(15);
/** Клик, а не поворот камеры: курсор сдвинулся меньше чем на столько пикселей. */
const CLICK_TOLERANCE = 4;

/** Сцена из нескольких моделей: тот же свет, пол, камера и режимы, что во вьювере. */
export function SceneCanvas() {
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      frameloop="demand"
      gl={{ antialias: true, toneMapping: THREE.AgXToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
      camera={{ fov: CAMERA_FOV, near: 0.01, far: 1000, position: [3, 2, 3] }}
    >
      <SceneContent />
    </Canvas>
  );
}

/** Куда повести камеру, когда сцена обновится. */
type PendingCamera = 'initial' | 'general' | 'fit' | null;

function SceneContent() {
  const gl = useThree((s) => s.gl);
  const invalidate = useThree((s) => s.invalidate);
  const [stage, setStage] = useState<SceneStage | null>(null);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const pendingCamera = useRef<PendingCamera>('initial');
  const mannequin = useViewer((s) => s.mannequin);
  const dimensions = useViewer((s) => s.dimensions);

  useEffect(() => {
    const s = new SceneStage(gl, {
      onChange: (snap) => {
        setSnapshot(snap);
        useScene.getState().setStatus(snap.status);
        invalidate();
      },
      onPlaced: (positions, total) => {
        useScene.getState().setPositions(positions);
        // Сцена была пустой — общий вид; иначе вписать всё, не меняя ракурс.
        pendingCamera.current = positions.length === total ? 'general' : 'fit';
      },
      onReloaded: (ids) => {
        const models = useCatalog.getState().models;
        const names = ids.map((id) => `«${models[id]?.title ?? id}»`).join(', ');
        useViewer.getState().showToast(ids.length > 1 ? `Обновлены ${names}` : `Обновлена ${names}`);
      },
    });
    setStage(s);
    // Сохранённый ракурс сцены, а у новой сцены — «Общий» вид, когда загрузятся модели.
    const saved = useScene.getState().camera;
    if (saved) {
      useViewer.getState().lookAt(saved.position, saved.target);
      pendingCamera.current = null;
    } else {
      useViewer.getState().setView('general', { instant: true });
    }
    return () => {
      s.dispose();
      disposeGltfLoader();
      setStage(null);
    };
  }, [gl, invalidate]);

  const items = useScene((s) => s.items);
  const models = useCatalog((s) => s.models);
  const catalogLoaded = useCatalog((s) => s.loaded);
  useEffect(() => stage?.sync(items, catalogLoaded ? models : null), [stage, items, models, catalogLoaded]);

  // Камера — после того, как новые габариты дошли до CameraRig.
  useEffect(() => {
    const pending = pendingCamera.current;
    if (!pending) return;
    const v = useViewer.getState();
    if (pending === 'initial') {
      // Открытая сцена: дождаться, пока загрузятся все модели.
      const loading = Object.values(snapshot.status).some((st) => st.state === 'loading');
      if (snapshot.instances.length === 0 || loading) return;
      v.setView('general', { instant: true });
    } else if (pending === 'general') {
      v.setView('general');
    } else {
      v.fit();
    }
    pendingCamera.current = null;
  }, [snapshot]);

  const { instances, bounds } = snapshot;
  const gizmoRef = useRef<TransformControlsImpl>(null);
  const modelBounds = useCallback(
    (uid: string) => {
      const inst = instances.find((i) => i.uid === uid);
      return inst ? objectBox(inst.meshes) : null;
    },
    [instances],
  );

  return (
    <>
      <SceneLighting bounds={bounds} />
      <Turntable bounds={bounds}>
        {stage && <primitive object={stage.root} />}
        {dimensions && instances.length > 0 && <Dimensions bounds={bounds} />}
      </Turntable>
      {mannequin && <Mannequin bounds={bounds} />}
      <SceneEffects instances={instances} />
      {stage && <CameraRig bounds={bounds} target={stage.root} objectBounds={modelBounds} onRest={saveCamera} />}
      {stage && <ScenePicker stage={stage} gizmoRef={gizmoRef} />}
      {stage && <Selection stage={stage} instances={instances} gizmoRef={gizmoRef} />}
      <Screenshot title="Сцена" />
    </>
  );
}

const saveCamera = (position: Vec3, target: Vec3) => useScene.getState().setCamera({ position, target });

/** Режим отображения, влажность и каркас — для всех моделей сцены. Порядок эффектов важен. */
function SceneEffects({ instances }: { instances: SceneInstance[] }) {
  const displayMode = useViewer((s) => s.displayMode);
  const wetness = useViewer((s) => s.wetness);
  const wireframe = useViewer((s) => s.wireframe);
  const wireColor = useViewer((s) => LIGHT_PRESETS[s.lightPreset].wireframeColor);
  const invalidate = useThree((s) => s.invalidate);

  useLayoutEffect(() => {
    for (const inst of instances) applyDisplayMode(inst.meshes, displayMode);
    invalidate();
  }, [instances, displayMode, invalidate]);

  // Материалы у копий общие — влажность ставится на каждый материал один раз.
  useLayoutEffect(() => {
    applyWetness(
      instances.flatMap((i) => i.meshes),
      wetness / 100,
    );
    invalidate();
  }, [instances, wetness, invalidate]);

  useLayoutEffect(() => {
    for (const inst of instances) applyMeshState(inst.root, inst.meshes, wireframe, wireColor, NO_HIDDEN);
    invalidate();
  }, [instances, wireframe, wireColor, displayMode, invalidate]);

  return null;
}

/** Клик по модели во вьюпорте выделяет её, клик мимо — снимает выделение. Клик по гизмо не в счёт. */
function ScenePicker({ stage, gizmoRef }: { stage: SceneStage; gizmoRef: RefObject<TransformControlsImpl | null> }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    raycaster.layers.enable(HIDDEN_SURFACE_LAYER);
    const ndc = new THREE.Vector2();
    let down: { x: number; y: number; onGizmo: boolean } | null = null;

    const onDown = (e: PointerEvent) => {
      // Гизмо запоминает ручку под курсором (axis) — по ней и видно, что нажали на гизмо.
      // В типах three-stdlib axis закрыт, хотя это публичное поле.
      const axis = (gizmoRef.current as unknown as { axis: string | null } | null)?.axis;
      down = e.button === 0 ? { x: e.clientX, y: e.clientY, onGizmo: axis != null } : null;
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || e.button !== 0 || d.onGizmo) return;
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_TOLERANCE) return;
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(stage.root, true).find((h) => isVisible(h.object));
      useScene.getState().select(hit ? stage.uidOf(hit.object) : null);
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
    };
  }, [gl, camera, stage, gizmoRef]);

  return null;
}

function isVisible(obj: THREE.Object3D | null): boolean {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

/** Нажат ли Shift — гизмо без привязки к шагу. */
function useShiftRef() {
  const shift = useRef(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => (shift.current = e.shiftKey);
    const onBlur = () => (shift.current = false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  return shift;
}

/**
 * Выделенная модель: обводка и гизмо. Перемещение — по трём осям, поворот — только вокруг вертикали.
 * Привязка к шагу считается здесь, в координатах сцены: у гизмо поворот округлялся бы от
 * начального угла. Пока тянем — двигается сам объект, а координаты для полей идут в live;
 * в стор положение уходит, когда кнопку отпустили.
 */
function Selection({
  stage,
  instances,
  gizmoRef,
}: {
  stage: SceneStage;
  instances: SceneInstance[];
  gizmoRef: RefObject<TransformControlsImpl | null>;
}) {
  const selected = useScene((s) => s.selected);
  const mode = useScene((s) => s.gizmo);
  const drop = useScene((s) => s.drop);
  const invalidate = useThree((s) => s.invalidate);
  const shift = useShiftRef();
  const inst = instances.find((i) => i.uid === selected && i.root.visible);
  const outlined = useMemo(() => (inst ? [inst.root] : []), [inst]);

  // Гизмо создаётся заново при каждом выделении — перекрасить его оси под Blender.
  const hasGizmo = inst !== undefined;
  useLayoutEffect(() => {
    if (hasGizmo && gizmoRef.current) blenderAxisColors(gizmoRef.current);
  }, [hasGizmo, gizmoRef]);

  // «Опустить на поверхность».
  const lastDrop = useRef(drop?.seq ?? 0);
  useEffect(() => {
    if (!drop || drop.seq === lastDrop.current) return;
    lastDrop.current = drop.seq;
    const target = instances.find((i) => i.uid === drop.uid);
    if (!target) return;
    const { position, rotation } = target.root;
    useScene.getState().setTransform(target.uid, [position.x, stage.surfaceY(target), position.z], rotation.y);
  }, [drop, instances, stage]);

  const onObjectChange = useCallback(() => {
    if (!inst) return;
    const { root } = inst;
    const free = shift.current;
    let yaw = new THREE.Euler().setFromQuaternion(root.quaternion, 'YXZ').y;
    if (!free) yaw = Math.round(yaw / ROTATE_STEP) * ROTATE_STEP;
    root.rotation.set(0, yaw, 0);
    const p = root.position;
    if (mode === 'translate' && !free) p.set(snap(p.x), snap(p.y), snap(p.z));
    root.updateMatrix();
    useScene.getState().setLive({ uid: inst.uid, position: [p.x, p.y, p.z], rotationY: yaw });
    invalidate();
  }, [inst, mode, shift, invalidate]);

  const onMouseDown = useCallback(() => {
    if (inst) stage.dragging = inst.uid;
  }, [inst, stage]);

  const onMouseUp = useCallback(() => {
    stage.dragging = null;
    if (!inst) return;
    const { position, rotation } = inst.root;
    const scene = useScene.getState();
    scene.setTransform(inst.uid, [position.x, position.y, position.z], rotation.y);
    scene.setLive(null);
  }, [inst, stage]);

  if (!inst) return null;
  return (
    <>
      <SelectionOutline objects={outlined} />
      <TransformControls
        ref={gizmoRef}
        object={inst.root}
        mode={mode}
        space="world"
        size={0.9}
        showX={mode === 'translate'}
        showZ={mode === 'translate'}
        onObjectChange={onObjectChange}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
      />
    </>
  );
}

const snap = (v: number) => Math.round(v / MOVE_STEP) * MOVE_STEP;

/**
 * Цвета осей гизмо как в Blender: вертикаль (Y сцены, Z в Blender) — синяя, глубина — зелёная.
 * У гизмо зелёный и синий — общие материалы осей, плоскостей и колец; меняются местами.
 */
function blenderAxisColors(gizmo: THREE.Object3D): void {
  const swap: Record<number, number> = { 0x00ff00: 0x0000ff, 0x0000ff: 0x00ff00 };
  const done = new Set<THREE.Material>();
  gizmo.traverse((o) => {
    const m = (o as THREE.Mesh).material as (THREE.MeshBasicMaterial & { tempColor?: THREE.Color }) | undefined;
    if (!m || done.has(m) || !m.color || m.userData.blenderAxes) return;
    done.add(m);
    m.userData.blenderAxes = true;
    // tempColor — исходный цвет, к которому гизмо возвращается после подсветки ручки.
    const base = m.tempColor ?? m.color;
    const to = swap[base.getHex()];
    if (to === undefined) return;
    m.color.setHex(to);
    m.tempColor?.setHex(to);
  });
}
