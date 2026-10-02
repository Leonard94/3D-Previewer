// Настройка источников света пресета под размер модели. Общая для вьювера (Lighting.tsx) и миниатюр.
import * as THREE from 'three';
import type { ModelBounds } from './bounds.ts';
import { directionFromAngles, kelvinToColor } from './color.ts';
import { HDRI_SUN_ELEVATION_RANGE, type DirectionalSpec, type SpotSpec } from './lightPresets.ts';

const DEG = Math.PI / 180;
export const SHADOW_MAP_SIZE = 2048;

/** Азимут и высота солнца: из HDRI (высота ограничена), иначе — из пресета. */
function sunAngles(spec: DirectionalSpec, sun: THREE.Vector3 | null): [number, number] {
  if (!sun) return [spec.azimuth, spec.elevation];
  const azimuth = Math.atan2(sun.x, sun.z) / DEG;
  const elevation = Math.asin(THREE.MathUtils.clamp(sun.y, -1, 1)) / DEG;
  const [lo, hi] = HDRI_SUN_ELEVATION_RANGE;
  return [azimuth, THREE.MathUtils.clamp(elevation, lo, hi)];
}

function createShadowed<T extends THREE.DirectionalLight | THREE.SpotLight>(light: T): T {
  light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
  light.shadow.bias = -0.0004;
  return light;
}

export const createDirectionalLight = () => createShadowed(new THREE.DirectionalLight());
export const createSpotLight = () => createShadowed(new THREE.SpotLight());

function aimAt(target: THREE.Object3D, bounds: ModelBounds) {
  target.position.copy(bounds.center);
  target.updateMatrixWorld();
}

/** Направленный свет на расстоянии 4 радиусов; камера теней накрывает модель с запасом. */
export function configureDirectionalLight(
  light: THREE.DirectionalLight,
  target: THREE.Object3D,
  spec: DirectionalSpec,
  bounds: ModelBounds,
  shadowRadius: number,
  sunDirection: THREE.Vector3 | null,
  shadows = true,
): void {
  const r = bounds.radius;
  const [az, el] = sunAngles(spec, sunDirection);
  aimAt(target, bounds);
  light.target = target;
  light.position.copy(bounds.center).addScaledVector(directionFromAngles(az, el), r * 4);
  light.color.copy(kelvinToColor(spec.kelvin));
  light.intensity = spec.intensity;
  light.castShadow = shadows && !!spec.castShadow;
  light.shadow.radius = shadowRadius;
  light.shadow.normalBias = r * 0.004;
  const cam = light.shadow.camera;
  cam.left = -r * 1.3;
  cam.right = r * 1.3;
  cam.top = r * 1.3;
  cam.bottom = -r * 1.3;
  cam.near = r * 0.5;
  cam.far = r * 8;
  cam.updateProjectionMatrix();
}

/** Прожектор на расстоянии spec.distance радиусов; конус накрывает модель с запасом. */
export function configureSpotLight(
  light: THREE.SpotLight,
  target: THREE.Object3D,
  spec: SpotSpec,
  bounds: ModelBounds,
  shadowRadius: number,
  shadows = true,
): void {
  const r = bounds.radius;
  const distance = r * spec.distance;
  aimAt(target, bounds);
  light.target = target;
  light.position.copy(bounds.center).addScaledVector(directionFromAngles(spec.azimuth, spec.elevation), distance);
  light.color.copy(kelvinToColor(spec.kelvin));
  // Освещённость в центре модели не зависит от её размера (decay = 2).
  light.intensity = spec.intensity * distance * distance;
  light.decay = 2;
  light.angle = Math.min(Math.atan((r * 1.35) / distance), 80 * DEG);
  light.penumbra = spec.penumbra;
  light.castShadow = shadows && !!spec.castShadow;
  light.shadow.radius = shadowRadius;
  light.shadow.normalBias = r * 0.004;
  light.shadow.camera.near = distance * 0.2;
  light.shadow.camera.far = distance * 3;
  light.shadow.camera.updateProjectionMatrix();
}
