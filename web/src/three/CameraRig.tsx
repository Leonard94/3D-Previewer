import { CameraControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import type CameraControlsImpl from 'camera-controls';
import { useViewer, type CameraCommand } from '../store/viewer.ts';
import { boundsFromBox, type ModelBounds } from './bounds.ts';
import { HIDDEN_SURFACE_LAYER } from './wireframe.ts';
import { fitDistance, orientationToDirection, viewOrientation } from './views.ts';

/** SmoothDamp-время: визуально переход занимает ~0,6 с. */
const TRANSITION_SMOOTH_TIME = 0.18;
/** Двойной клик: новое расстояние — 25 % текущего, но не ближе 0,3 м. */
const FOCUS_FACTOR = 0.25;
const FOCUS_MIN_DISTANCE = 0.3;

function isVisible(obj: THREE.Object3D | null): boolean {
  for (let o = obj; o; o = o.parent) if (!o.visible) return false;
  return true;
}

interface Props {
  bounds: ModelBounds;
  /** Объект модели — для двойного клика по поверхности. */
  target: THREE.Object3D;
  /** Мировой AABB объекта модели по имени — для «вписать объект». */
  objectBounds: (name: string) => THREE.Box3 | null;
}

export function CameraRig({ bounds, target, objectBounds }: Props) {
  const controlsRef = useRef<CameraControlsImpl>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const command = useViewer((s) => s.command);
  const lastSeq = useRef(0);

  // near/far и пределы зума — от размера модели.
  useEffect(() => {
    const r = bounds.radius;
    camera.near = Math.max(0.001, r * 0.002);
    camera.far = Math.max(200, r * 80);
    camera.updateProjectionMatrix();
    const c = controlsRef.current;
    if (c) {
      c.minDistance = Math.max(0.005, r * 0.03);
      c.maxDistance = r * 25 + 5;
    }
    invalidate();
  }, [bounds, camera, invalidate]);

  // Команды из стора: виды, «вписать», фокус по двойному клику.
  useEffect(() => {
    const c = controlsRef.current;
    if (!c || !command || command.seq <= lastSeq.current) return;
    lastSeq.current = command.seq;
    void runCommand(c, command);
    invalidate();

    function runCommand(c: CameraControlsImpl, cmd: CameraCommand) {
      const aspect = size.width / Math.max(size.height, 1);
      // Без нормализации после нескольких оборотов переход крутил бы камеру лишние круги.
      c.normalizeRotations();
      if (cmd.kind === 'view') {
        const dir = orientationToDirection(viewOrientation(cmd.view, bounds));
        const d = fitDistance(bounds, dir, camera.fov, aspect);
        const p = bounds.center.clone().addScaledVector(dir, d);
        const t = bounds.center;
        return c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, !cmd.instant);
      }
      if (cmd.kind === 'fit') {
        const dir = c.getPosition(new THREE.Vector3()).sub(c.getTarget(new THREE.Vector3())).normalize();
        const d = fitDistance(bounds, dir, camera.fov, aspect);
        const p = bounds.center.clone().addScaledVector(dir, d);
        const t = bounds.center;
        return c.setLookAt(p.x, p.y, p.z, t.x, t.y, t.z, true);
      }
      if (cmd.kind === 'object') {
        // Объект — в текущем ракурсе, вписан в кадр; он же становится центром вращения.
        const box = objectBounds(cmd.name);
        if (!box || box.isEmpty()) return;
        const b = boundsFromBox(box);
        const dir = c.getPosition(new THREE.Vector3()).sub(c.getTarget(new THREE.Vector3())).normalize();
        const d = fitDistance(b, dir, camera.fov, aspect);
        const p = b.center.clone().addScaledVector(dir, d);
        return c.setLookAt(p.x, p.y, p.z, b.center.x, b.center.y, b.center.z, true);
      }
      const point = new THREE.Vector3(...cmd.point);
      const pos = c.getPosition(new THREE.Vector3());
      const dir = pos.clone().sub(c.getTarget(new THREE.Vector3()));
      const current = dir.length();
      const next = Math.min(current, Math.max(FOCUS_MIN_DISTANCE, current * FOCUS_FACTOR));
      const p = point.clone().addScaledVector(dir.normalize(), next);
      return c.setLookAt(p.x, p.y, p.z, point.x, point.y, point.z, true);
    }
  }, [command, bounds, camera, size, invalidate, objectBounds]);

  // Ручное управление сбрасывает подсветку активного вида.
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    const onStart = () => useViewer.getState().clearActiveView();
    c.addEventListener('controlstart', onStart);
    return () => c.removeEventListener('controlstart', onStart);
  }, []);

  // Двойной клик по поверхности: точка становится центром вращения, камера приближается.
  // Свой raycast вместо событий r3f: тяжёлые меши не перебираются на каждое движение мыши.
  useEffect(() => {
    const el = gl.domElement;
    const raycaster = new THREE.Raycaster();
    // В режиме «Только каркас» поверхности на скрытом слое — по ним тоже можно кликать.
    raycaster.layers.enable(HIDDEN_SURFACE_LAYER);
    const ndc = new THREE.Vector2();
    const onDblClick = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hit = raycaster.intersectObject(target, true).find((h) => isVisible(h.object));
      if (hit) useViewer.getState().focusPoint(hit.point);
    };
    el.addEventListener('dblclick', onDblClick);
    return () => el.removeEventListener('dblclick', onDblClick);
  }, [gl, camera, target]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      smoothTime={TRANSITION_SMOOTH_TIME}
      draggingSmoothTime={0.08}
      dollySpeed={0.6}
    />
  );
}
