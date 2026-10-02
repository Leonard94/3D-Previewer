import * as THREE from 'three';
import type { ModelBounds } from './bounds.ts';

export type ViewName = 'general' | 'top' | 'side';

export const VIEW_LABELS: Record<ViewName, string> = {
  general: 'Общий',
  top: 'Сверху',
  side: 'Сбоку',
};

/** Перспективная камера вьювера и миниатюр: небольшой FOV — меньше искажений. */
export const CAMERA_FOV = 35;

/** Запас при вписывании модели в кадр. */
export const FIT_MARGIN = 1.15;
/** Почти строго сверху, но без вырождения орбиты. */
const TOP_POLAR = 0.001;

const DEG = Math.PI / 180;

export interface Orientation {
  /** Азимут камеры: 0 — со стороны +Z (фронт glTF), растёт к +X. */
  azimuth: number;
  /** Полярный угол от +Y: 0 — сверху, π/2 — горизонтально. */
  polar: number;
}

export function viewOrientation(view: ViewName, bounds: ModelBounds): Orientation {
  switch (view) {
    case 'general':
      // 3/4 спереди-справа-сверху: азимут 45° от +Z к +X, высота 30° над горизонтом.
      return { azimuth: 45 * DEG, polar: 60 * DEG };
    case 'top':
      // Азимут 0: при взгляде сверху фронт модели (+Z) оказывается внизу экрана.
      return { azimuth: 0, polar: TOP_POLAR };
    case 'side': {
      // Перпендикулярно самой длинной горизонтальной стороне; при равных — спереди.
      const { x, z } = bounds.size;
      return { azimuth: x >= z ? 0 : 90 * DEG, polar: 90 * DEG };
    }
  }
}

/** Единичный вектор от цели к камере. */
export function orientationToDirection({ azimuth, polar }: Orientation): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(polar) * Math.sin(azimuth), Math.cos(polar), Math.sin(polar) * Math.cos(azimuth));
}

/**
 * Расстояние от центра AABB, на котором коробка целиком помещается в кадр
 * перспективной камеры, смотрящей вдоль -dir. Учитывает соотношение сторон.
 */
export function fitDistance(
  bounds: ModelBounds,
  dir: THREE.Vector3,
  fovDeg: number,
  aspect: number,
  margin = FIT_MARGIN,
): number {
  // Базис камеры: forward = -dir, up — проекция мирового Y (или -Z, если смотрим строго сверху).
  const forward = dir.clone().negate();
  const worldUp = Math.abs(forward.y) > 0.999 ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(forward, worldUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, forward).normalize();

  const tanV = Math.tan((fovDeg * DEG) / 2);
  const tanH = tanV * aspect;
  const { min, max } = bounds.box;
  const c = bounds.center;
  let distance = 0;
  const corner = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    corner.set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z).sub(c);
    const x = Math.abs(corner.dot(right)) * margin;
    const y = Math.abs(corner.dot(up)) * margin;
    const depth = corner.dot(dir); // насколько угол ближе к камере, чем центр
    // Угол должен попасть в пирамиду видимости: d - depth >= x / tanH и y / tanV.
    distance = Math.max(distance, depth + x / tanH, depth + y / tanV);
  }
  return Math.max(distance, bounds.radius * 0.05);
}
