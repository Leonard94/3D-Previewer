import * as THREE from 'three';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export interface LoadedHdri {
  texture: THREE.DataTexture;
  /** Направление на самую яркую точку неба (солнце), если оно выше горизонта. */
  sunDirection: THREE.Vector3 | null;
}

const hdriCache = new Map<string, Promise<LoadedHdri>>();

/** HDRI грузятся один раз за вкладку и переиспользуются при переключении пресетов. */
export function loadHdri(url: string): Promise<LoadedHdri> {
  let p = hdriCache.get(url);
  if (!p) {
    p = new HDRLoader().loadAsync(url).then((texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      return { texture, sunDirection: findSun(texture) };
    });
    // Ошибку не кешируем: файл могут докачать без перезагрузки вкладки.
    p.catch(() => hdriCache.delete(url));
    hdriCache.set(url, p);
  }
  return p;
}

/**
 * Ищет солнце: самый яркий пиксель верхней полусферы equirect-карты.
 * Отображение uv → направление — как в шейдере three (equirectUv).
 */
function findSun(texture: THREE.DataTexture): THREE.Vector3 | null {
  const { data, width, height } = texture.image as { data: ArrayLike<number>; width: number; height: number };
  if (!data || !width || !height) return null;
  const half = texture.type === THREE.HalfFloatType;
  const read = half ? (i: number) => THREE.DataUtils.fromHalfFloat(data[i]!) : (i: number) => data[i]!;
  const channels = data.length / (width * height);

  let best = -1;
  let bx = 0;
  let by = 0;
  // Строка 0 — верх картинки (зенит); берём только небо, с шагом 2 — солнце шире пикселя.
  for (let y = 0; y < height / 2; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * channels;
      const lum = 0.2126 * read(i) + 0.7152 * read(i + 1) + 0.0722 * read(i + 2);
      if (lum > best) {
        best = lum;
        bx = x;
        by = y;
      }
    }
  }
  if (best <= 0) return null;
  const u = (bx + 0.5) / width;
  const v = 1 - (by + 0.5) / height;
  const phi = (u - 0.5) * 2 * Math.PI; // atan(dir.z, dir.x)
  const elev = (v - 0.5) * Math.PI; // asin(dir.y)
  if (elev < 3 * (Math.PI / 180)) return null;
  return new THREE.Vector3(Math.cos(elev) * Math.cos(phi), Math.sin(elev), Math.cos(elev) * Math.sin(phi)).normalize();
}

const roomCache = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();

/** RoomEnvironment из three — окружение без файлов. Один PMREM на рендерер. */
export function getRoomEnvironment(gl: THREE.WebGLRenderer): THREE.Texture {
  let tex = roomCache.get(gl);
  if (!tex) {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = new RoomEnvironment();
    tex = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    roomCache.set(gl, tex);
  }
  return tex;
}

export function disposeRoomEnvironment(gl: THREE.WebGLRenderer): void {
  roomCache.get(gl)?.dispose();
  roomCache.delete(gl);
}
