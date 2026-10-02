// Режимы отображения — временная подмена материалов; оригиналы восстанавливаются.
// Влажность в режимах не действует: материалы режимов строятся из исходных (сухих) значений.
import * as THREE from 'three';

export type DisplayMode = 'normal' | 'color' | 'normals' | 'uv';

export const DISPLAY_MODES: DisplayMode[] = ['normal', 'color', 'normals', 'uv'];

export const DISPLAY_MODE_LABELS: Record<DisplayMode, string> = {
  normal: 'Обычный',
  color: 'Только цвет',
  normals: 'Нормали',
  uv: 'UV-шахматка',
};

export const DISPLAY_MODE_HINTS: Record<DisplayMode, string> = {
  normal: 'Исходные материалы',
  color: 'Base Color без света — проверка альбедо',
  normals: 'Нормали с картой нормалей — проверка шейдинга',
  uv: 'Шахматка по UV0 — растяжения и швы развёртки',
};

type MaterialSlot = THREE.Material | THREE.Material[];
type ModeMaterials = Partial<Record<Exclude<DisplayMode, 'normal'>, THREE.Material>>;

/** Шахматка 1024²: 8×8 цветных клеток с подписями A1…H8. */
const CHECKER_SIZE = 1024;
const CHECKER_CELLS = 8;
let checker: THREE.CanvasTexture | null = null;

function checkerTexture(): THREE.CanvasTexture {
  if (checker) return checker;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CHECKER_SIZE;
  const ctx = canvas.getContext('2d')!;
  const cell = CHECKER_SIZE / CHECKER_CELLS;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${cell * 0.3}px Inter, sans-serif`;
  for (let row = 0; row < CHECKER_CELLS; row++) {
    for (let col = 0; col < CHECKER_CELLS; col++) {
      const hue = (col / CHECKER_CELLS) * 360;
      const dark = (row + col) % 2 === 1;
      ctx.fillStyle = `hsl(${hue} ${dark ? 45 : 60}% ${dark ? 38 : 72}%)`;
      ctx.fillRect(col * cell, row * cell, cell, cell);
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.75)';
      ctx.fillText(`${String.fromCharCode(65 + col)}${row + 1}`, (col + 0.5) * cell, (row + 0.5) * cell);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  // Как у текстур glTF: начало UV — левый верхний угол картинки, иначе подписи отразятся.
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  checker = tex;
  return tex;
}

function createModeMaterial(original: THREE.Material, mode: Exclude<DisplayMode, 'normal'>): THREE.Material {
  const src = original as THREE.MeshStandardMaterial;
  const common = { side: original.side, transparent: original.transparent, opacity: original.opacity, alphaTest: original.alphaTest };
  switch (mode) {
    case 'color': {
      // Сухой исходный цвет: влажность в режимах не применяется.
      const base = (original.userData.wetBase as { color?: THREE.Color } | undefined)?.color ?? src.color;
      return new THREE.MeshBasicMaterial({
        ...common,
        color: base?.clone() ?? new THREE.Color(1, 1, 1),
        map: src.map ?? null,
        alphaMap: src.alphaMap ?? null,
        vertexColors: original.vertexColors,
        toneMapped: false,
      });
    }
    case 'normals':
      return new THREE.MeshNormalMaterial({
        side: original.side,
        normalMap: src.normalMap ?? null,
        normalMapType: src.normalMapType ?? THREE.TangentSpaceNormalMap,
        normalScale: src.normalScale?.clone() ?? new THREE.Vector2(1, 1),
      });
    case 'uv':
      return new THREE.MeshBasicMaterial({ side: original.side, map: checkerTexture(), toneMapped: false });
  }
}

function modeMaterial(original: THREE.Material, mode: Exclude<DisplayMode, 'normal'>): THREE.Material {
  const cache = (original.userData.displayModes ??= {}) as ModeMaterials;
  return (cache[mode] ??= createModeMaterial(original, mode));
}

/** Подменяет материалы мешей; 'normal' возвращает исходные. */
export function applyDisplayMode(meshes: THREE.Mesh[], mode: DisplayMode): void {
  for (const mesh of meshes) {
    const original = (mesh.userData.originalMaterial as MaterialSlot | undefined) ?? mesh.material;
    if (mode === 'normal') {
      mesh.material = original;
      delete mesh.userData.originalMaterial;
      continue;
    }
    mesh.userData.originalMaterial = original;
    mesh.material = Array.isArray(original) ? original.map((m) => modeMaterial(m, mode)) : modeMaterial(original, mode);
  }
}

/** Исходные материалы меша (даже если сейчас включён режим отображения). */
export function originalMaterials(mesh: THREE.Mesh): THREE.Material[] {
  const m = (mesh.userData.originalMaterial as MaterialSlot | undefined) ?? mesh.material;
  return Array.isArray(m) ? m : [m];
}

/** Освобождает материалы режимов (шахматка общая — остаётся). */
export function disposeDisplayModes(meshes: THREE.Mesh[]): void {
  for (const mesh of meshes) {
    for (const m of originalMaterials(mesh)) {
      const cache = m.userData.displayModes as ModeMaterials | undefined;
      if (!cache) continue;
      for (const mat of Object.values(cache)) mat?.dispose();
      delete m.userData.displayModes;
    }
  }
}
