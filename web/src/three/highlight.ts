// Подсветка объекта при наведении в списке: полупрозрачная копия меша поверх него.
// Материалы модели не трогаем — они общие у разных объектов.
import * as THREE from 'three';

export const HIGHLIGHT_COLOR = '#d9c7a0';
const HIGHLIGHT_OPACITY = 0.45;

const noRaycast = () => {};

let material: THREE.MeshBasicMaterial | null = null;

function highlightMaterial(): THREE.MeshBasicMaterial {
  material ??= new THREE.MeshBasicMaterial({
    color: HIGHLIGHT_COLOR,
    transparent: true,
    opacity: HIGHLIGHT_OPACITY,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    // Чуть ближе к камере, чем сама поверхность, — без мерцания.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  return material;
}

function overlayFor(mesh: THREE.Mesh): THREE.Mesh {
  let overlay = mesh.userData.highlight as THREE.Mesh | undefined;
  if (overlay) return overlay;
  if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
    const inst = mesh as THREE.InstancedMesh;
    const o = new THREE.InstancedMesh(inst.geometry, highlightMaterial(), inst.count);
    o.instanceMatrix = inst.instanceMatrix;
    overlay = o;
  } else {
    overlay = new THREE.Mesh(mesh.geometry, highlightMaterial());
  }
  overlay.name = `${mesh.name}__highlight`;
  overlay.raycast = noRaycast;
  overlay.renderOrder = 2;
  overlay.visible = false;
  mesh.add(overlay);
  mesh.userData.highlight = overlay;
  return overlay;
}

/**
 * Подсвечивает меши (остальные гасит). Подсветка видна и у скрытого объекта — так его проще найти.
 */
export function setHighlight(allMeshes: THREE.Mesh[], highlighted: ReadonlySet<THREE.Mesh>): void {
  for (const mesh of allMeshes) {
    const on = highlighted.has(mesh);
    const existing = mesh.userData.highlight as THREE.Mesh | undefined;
    if (on) overlayFor(mesh).visible = true;
    else if (existing) existing.visible = false;
  }
}

/** Убирает подсветку (геометрия общая с мешем — освобождается вместе с моделью). */
export function disposeHighlights(meshes: THREE.Mesh[]): void {
  for (const mesh of meshes) {
    const overlay = mesh.userData.highlight as THREE.Mesh | undefined;
    if (!overlay) continue;
    mesh.remove(overlay);
    delete mesh.userData.highlight;
  }
}
