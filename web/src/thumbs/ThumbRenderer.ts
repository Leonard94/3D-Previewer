// Рендер миниатюры: пресет «Нейтральный», вид «Общий», прозрачный фон и тень на полу.
// Без сетки, манекена и габаритов. Один скрытый WebGLRenderer на вкладку каталога.
import * as THREE from 'three';
import { computeBounds } from '../three/bounds.ts';
import { getRoomEnvironment, disposeRoomEnvironment } from '../three/environment.ts';
import { gridRadius } from '../three/Grid.tsx';
import { LIGHT_PRESETS } from '../three/lightPresets.ts';
import { disposeGltfLoader, disposeObject, loadGltf } from '../three/loader.ts';
import {
  configureDirectionalLight,
  configureSpotLight,
  createDirectionalLight,
  createSpotLight,
} from '../three/presetLights.ts';
import { CAMERA_FOV, fitDistance, orientationToDirection, viewOrientation } from '../three/views.ts';

export const THUMB_WIDTH = 640;
export const THUMB_HEIGHT = 480;
/** Рендерим вдвое крупнее и уменьшаем — края ровнее, чем только от MSAA. */
const SUPERSAMPLE = 2;
const WEBP_QUALITY = 0.9;

const PRESET = LIGHT_PRESETS.neutral;

export class ContextLostError extends Error {
  constructor() {
    super('WebGL-контекст потерян');
  }
}

export class ThumbRenderer {
  private readonly canvas = document.createElement('canvas');
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(CAMERA_FOV, THUMB_WIDTH / THUMB_HEIGHT, 0.01, 1000);
  private readonly floor: THREE.Mesh<THREE.PlaneGeometry, THREE.ShadowMaterial>;
  private readonly lights: { light: THREE.DirectionalLight | THREE.SpotLight; target: THREE.Object3D }[] = [];
  private readonly output = document.createElement('canvas');
  private lost = false;

  constructor() {
    this.canvas.width = THUMB_WIDTH * SUPERSAMPLE;
    this.canvas.height = THUMB_HEIGHT * SUPERSAMPLE;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });

    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(1);
    renderer.setSize(this.canvas.width, this.canvas.height, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = PRESET.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer = renderer;

    this.scene.environment = getRoomEnvironment(renderer);
    this.scene.environmentIntensity = PRESET.environment.intensity;

    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShadowMaterial({ transparent: true, opacity: PRESET.shadow.opacity, depthWrite: false }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    for (const spec of PRESET.lights) {
      const light = spec.kind === 'directional' ? createDirectionalLight() : createSpotLight();
      const target = new THREE.Object3D();
      this.scene.add(light, target);
      this.lights.push({ light, target });
    }

    this.output.width = THUMB_WIDTH;
    this.output.height = THUMB_HEIGHT;
  }

  get contextLost(): boolean {
    return this.lost;
  }

  /** Загружает модель, рендерит и возвращает картинку (WebP; PNG — если браузер не умеет WebP). */
  async render(url: string): Promise<Blob> {
    if (this.lost) throw new ContextLostError();
    const gltf = await loadGltf(this.renderer, url);
    const model = gltf.scene;
    try {
      model.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      const bounds = computeBounds(model);
      this.scene.add(model);

      // Пол и свет — под размер модели, как во вьювере.
      const radius = gridRadius(bounds);
      this.floor.position.set(bounds.center.x, 0, bounds.center.z);
      this.floor.scale.set(radius, radius, 1);
      PRESET.lights.forEach((spec, i) => {
        const { light, target } = this.lights[i]!;
        if (spec.kind === 'directional')
          configureDirectionalLight(light as THREE.DirectionalLight, target, spec, bounds, PRESET.shadow.radius, null);
        else configureSpotLight(light as THREE.SpotLight, target, spec, bounds, PRESET.shadow.radius);
      });

      // Вид «Общий», вписанный в кадр 4:3.
      const dir = orientationToDirection(viewOrientation('general', bounds));
      const distance = fitDistance(bounds, dir, CAMERA_FOV, THUMB_WIDTH / THUMB_HEIGHT);
      this.camera.position.copy(bounds.center).addScaledVector(dir, distance);
      this.camera.near = Math.max(0.001, bounds.radius * 0.002);
      this.camera.far = Math.max(200, bounds.radius * 80);
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(bounds.center);

      // Шейдеры компилируются параллельно, если драйвер умеет, — меньше подвисаний страницы.
      await this.renderer.compileAsync(this.scene, this.camera);
      if (this.lost) throw new ContextLostError();
      this.renderer.render(this.scene, this.camera);
      if (this.lost) throw new ContextLostError();

      const ctx = this.output.getContext('2d')!;
      ctx.clearRect(0, 0, THUMB_WIDTH, THUMB_HEIGHT);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.canvas, 0, 0, THUMB_WIDTH, THUMB_HEIGHT);
      return await new Promise<Blob>((resolve, reject) =>
        this.output.toBlob((b) => (b ? resolve(b) : reject(new Error('не удалось закодировать картинку'))), 'image/webp', WEBP_QUALITY),
      );
    } finally {
      // Ресурсы модели освобождаются после каждого рендера.
      this.scene.remove(model);
      disposeObject(model);
      this.renderer.renderLists.dispose();
    }
  }

  dispose(): void {
    for (const { light } of this.lights) light.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    disposeRoomEnvironment(this.renderer);
    disposeGltfLoader();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
