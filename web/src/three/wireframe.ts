// Каркас и видимость объектов. Линии каркаса (WireframeGeometry + LineSegments) — дочерние объекты
// мешей, поэтому следуют за трансформациями и вращением. Видимость меша задаётся слоями, а не visible:
// у узла glTF с одним примитивом дочерние узлы висят прямо на меше, и visible = false скрыл бы их тоже.
import * as THREE from 'three';

/** off — нет; overlay — поверх затенённой модели; only — только каркас, как Wireframe в Blender. */
export type WireframeMode = 'off' | 'overlay' | 'only';

/** Поверх модели линии чуть прозрачнее, чтобы не забивать текстуры. */
const OPACITY: Record<Exclude<WireframeMode, 'off'>, number> = { overlay: 0.4, only: 0.65 };

/**
 * Слой поверхностей в режиме «Только каркас»: камера и тени его не видят, а линии (слой 0)
 * остаются. Raycaster вьювера этот слой видит — двойной клик по каркасу работает.
 */
export const HIDDEN_SURFACE_LAYER = 31;
/** Слой скрытых объектов: не видят ни камера, ни тени, ни двойной клик. */
export const HIDDEN_OBJECT_LAYER = 30;
/** Для инстансинга: больше экземпляров каркасом не рисуем. */
const MAX_INSTANCE_WIRES = 1000;

interface WireState {
  material: THREE.LineBasicMaterial;
  /** Меш → его линии каркаса. */
  lines: Map<THREE.Mesh, THREE.LineSegments[]>;
}

const noRaycast = () => {};
/** Материалы, которым polygonOffset включили мы (свой у материала не трогаем). */
const offsetByUs = new WeakSet<THREE.Material>();

/** Строит линии один раз, при первом включении. Геометрии освобождаются вместе с моделью. */
function buildWires(meshes: THREE.Mesh[]): WireState {
  const material = new THREE.LineBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false });
  const lines = new Map<THREE.Mesh, THREE.LineSegments[]>();
  for (const mesh of meshes) {
    const geometry = new THREE.WireframeGeometry(mesh.geometry);
    const instanced = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh) : null;
    const count = instanced ? Math.min(instanced.count, MAX_INSTANCE_WIRES) : 1;
    const list: THREE.LineSegments[] = [];
    for (let i = 0; i < count; i++) {
      const line = new THREE.LineSegments(geometry, material);
      line.name = `${mesh.name}__wireframe`;
      line.raycast = noRaycast;
      line.renderOrder = 1;
      if (instanced) {
        instanced.getMatrixAt(i, line.matrix);
        line.matrix.decompose(line.position, line.quaternion, line.scale);
      }
      mesh.add(line);
      list.push(line);
    }
    lines.set(mesh, list);
  }
  return { material, lines };
}

function setPolygonOffset(m: THREE.Material, on: boolean) {
  if (on) {
    if (m.polygonOffset && !offsetByUs.has(m)) return;
    m.polygonOffset = true;
    m.polygonOffsetFactor = 1;
    m.polygonOffsetUnits = 1;
    offsetByUs.add(m);
  } else if (offsetByUs.has(m)) {
    m.polygonOffset = false;
    m.polygonOffsetFactor = 0;
    m.polygonOffsetUnits = 0;
    offsetByUs.delete(m);
  }
}

/**
 * Каркас и видимость мешей. «Поверх»: текущим материалам ставится polygonOffset — поверхность чуть
 * отодвигается вглубь, и линии не мерцают. «Только»: поверхности уходят на скрытый слой — видны
 * все рёбра, включая задние. Скрытые объекты прячутся вместе с каркасом. Шейдеры не перекомпилируются.
 */
export function applyMeshState(
  root: THREE.Object3D,
  meshes: THREE.Mesh[],
  mode: WireframeMode,
  color: string,
  hidden: ReadonlySet<THREE.Mesh>,
): void {
  const data = root.userData as { wireframe?: WireState };
  if (mode !== 'off') data.wireframe ??= buildWires(meshes);
  const state = data.wireframe;
  if (state && mode !== 'off') {
    state.material.color.set(color);
    state.material.opacity = OPACITY[mode];
  }

  for (const mesh of meshes) {
    const isHidden = hidden.has(mesh);
    mesh.layers.set(isHidden ? HIDDEN_OBJECT_LAYER : mode === 'only' ? HIDDEN_SURFACE_LAYER : 0);
    for (const line of state?.lines.get(mesh) ?? []) line.visible = !isHidden && mode !== 'off';
    const mat = mesh.material;
    for (const m of Array.isArray(mat) ? mat : [mat]) setPolygonOffset(m, mode === 'overlay');
  }
}

export function disposeWireframe(root: THREE.Object3D): void {
  const data = root.userData as { wireframe?: WireState };
  data.wireframe?.material.dispose();
  delete data.wireframe;
}
