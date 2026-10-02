import * as THREE from 'three';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

/** Локальные копии декодеров (scripts/copy-decoders.ts) — без обращений в интернет. */
const DRACO_PATH = '/decoders/draco/';
const BASIS_PATH = '/decoders/basis/';

let shared: { loader: GLTFLoader; draco: DRACOLoader; ktx2: KTX2Loader; renderer: THREE.WebGLRenderer } | null = null;

/** Один загрузчик на рендерер: воркеры Draco/KTX2 создаются один раз. */
export function getGltfLoader(renderer: THREE.WebGLRenderer): GLTFLoader {
  if (shared?.renderer === renderer) return shared.loader;
  disposeGltfLoader();
  const draco = new DRACOLoader().setDecoderPath(DRACO_PATH);
  const ktx2 = new KTX2Loader().setTranscoderPath(BASIS_PATH).detectSupport(renderer);
  const loader = new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  shared = { loader, draco, ktx2, renderer };
  return loader;
}

export function disposeGltfLoader(): void {
  if (!shared) return;
  shared.draco.dispose();
  shared.ktx2.dispose();
  shared = null;
}

export function loadGltf(
  renderer: THREE.WebGLRenderer,
  url: string,
  onProgress?: (fraction: number | null) => void,
): Promise<GLTF> {
  return getGltfLoader(renderer).loadAsync(url, (e) => {
    onProgress?.(e.lengthComputable && e.total > 0 ? e.loaded / e.total : null);
  });
}

/** Освобождает геометрии, материалы и текстуры объекта. */
export function disposeObject(root: THREE.Object3D): void {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = mesh.material;
    if (mat) for (const m of Array.isArray(mat) ? mat : [mat]) materials.add(m);
  });
  for (const m of materials) {
    for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
    m.dispose();
  }
  for (const t of textures) t.dispose();
}
