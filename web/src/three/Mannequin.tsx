import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { ModelBounds } from './bounds.ts';

/** Рост манекена, м. */
export const MANNEQUIN_HEIGHT = 1.8;
/** Зазор между габаритами модели и манекеном, м. */
const GAP = 0.5;
/** Половина ширины плеч — чтобы зазор считался от края фигуры. */
const HALF_WIDTH = 0.3;

const noRaycast = () => {};

/** Части фигуры: [геометрия, x, y, z, масштаб, наклон по Z]. Рост ровно 1,8 м. */
function buildFigure(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const capsule = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 6, 16);
  const parts: [THREE.BufferGeometry, number, number, number, [number, number, number]?, number?][] = [
    [new THREE.SphereGeometry(0.105, 24, 16), 0, 1.695, 0], // голова: верх на 1,80
    [capsule(0.05, 0.06), 0, 1.55, 0], // шея
    [capsule(0.16, 0.36), 0, 1.24, 0, [1.25, 1, 0.7]], // торс
    [capsule(0.13, 0.08), 0, 0.95, 0, [1.25, 1, 0.75]], // таз
    [capsule(0.07, 0.76), -0.1, 0.45, 0], // ноги: низ на 0
    [capsule(0.07, 0.76), 0.1, 0.45, 0],
    [capsule(0.048, 0.6), -0.27, 1.14, 0, undefined, -0.08], // руки
    [capsule(0.048, 0.6), 0.27, 1.14, 0, undefined, 0.08],
  ];
  for (const [geometry, x, y, z, scale, tilt] of parts) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    if (scale) mesh.scale.set(...scale);
    if (tilt) mesh.rotation.z = tilt;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.raycast = noRaycast;
    group.add(mesh);
  }
  return group;
}

/**
 * Манекен 1,8 м для проверки масштаба: справа от модели, в 0,5 м от габаритов.
 * Не входит в модель — не влияет на статистику, вписывание камеры и миниатюры.
 */
export function Mannequin({ bounds }: { bounds: ModelBounds }) {
  const { group, material } = useMemo(() => {
    const material = new THREE.MeshStandardMaterial({ color: '#8d908c', roughness: 0.75 });
    return { group: buildFigure(material), material };
  }, []);

  useEffect(
    () => () => {
      group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      material.dispose();
    },
    [group, material],
  );

  return <primitive object={group} position={[bounds.box.max.x + GAP + HALF_WIDTH, 0, bounds.center.z]} />;
}
