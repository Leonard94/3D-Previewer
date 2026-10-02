// Имитация влажности: меняются только множители материала, геометрия и шейдеры — нет.
// В three.js roughness умножается на roughnessMap, а color — на map, поэтому смена множителей
// не требует перекомпиляции и работает в реальном времени.
import * as THREE from 'three';
import { originalMaterials } from './displayModes.ts';

/** При 100 % roughness = 24 % от исходной. */
export const WET_ROUGHNESS_DROP = 0.76;
/** При 100 % цвет ×0,68 (в линейном пространстве). */
export const WET_DARKEN = 0.32;
/** При 100 % отражения окружения ×1,5. */
export const WET_ENV_BOOST = 1.5;

export interface WetMultipliers {
  roughness: number;
  color: number;
  envMapIntensity: number;
}

/**
 * Множители к исходным значениям материала при влажности w (0..1).
 * Чистая функция — эту же формулу потом переносят в шейдер Godot.
 * normalMap, normalScale и emissive не меняются.
 */
export function wetMultipliers(w: number): WetMultipliers {
  const t = Math.min(Math.max(w, 0), 1);
  return {
    roughness: 1 - WET_ROUGHNESS_DROP * t,
    color: 1 - WET_DARKEN * t,
    envMapIntensity: 1 + (WET_ENV_BOOST - 1) * t,
  };
}

interface WetBase {
  roughness: number;
  color: THREE.Color;
  envMapIntensity: number;
}

type WetMaterial = THREE.MeshStandardMaterial & { userData: { wetBase?: WetBase } };

/**
 * Материалы, к которым применяется влажность: исходные Standard/Physical (unlit — MeshBasicMaterial —
 * не трогаем). Берутся исходные, даже если сейчас включён режим отображения.
 */
function wetMaterials(meshes: THREE.Mesh[]): Set<WetMaterial> {
  const result = new Set<WetMaterial>();
  for (const mesh of meshes) {
    for (const m of originalMaterials(mesh)) {
      if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) result.add(m as WetMaterial);
    }
  }
  return result;
}

/** Запоминает исходные значения в material.userData. Вызывать сразу после загрузки. */
export function prepareWetness(meshes: THREE.Mesh[]): void {
  for (const m of wetMaterials(meshes)) {
    m.userData.wetBase ??= { roughness: m.roughness, color: m.color.clone(), envMapIntensity: m.envMapIntensity };
  }
}

/** Применяет влажность w (0..1) ко всем материалам модели. */
export function applyWetness(meshes: THREE.Mesh[], w: number): void {
  const k = wetMultipliers(w);
  for (const m of wetMaterials(meshes)) {
    const base = m.userData.wetBase;
    if (!base) continue;
    m.roughness = base.roughness * k.roughness;
    m.color.copy(base.color).multiplyScalar(k.color);
    m.envMapIntensity = base.envMapIntensity * k.envMapIntensity;
  }
}
