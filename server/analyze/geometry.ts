import {
  Primitive,
  type Accessor,
  type Document,
  type Material,
  type Mesh,
  type Node,
  type Scene,
  type Texture,
  type TextureInfo as GltfTextureInfo,
} from '@gltf-transform/core';
import type { InstancedMesh, Transform } from '@gltf-transform/extensions';
import { VERTEX_ATTRIBUTES, type Bounds, type ObjectInfo, type Presence, type TexelDensity, type VertexAttribute } from '../../shared/types.ts';
import { DensityHistogram } from './density.ts';

type Mat4 = ArrayLike<number>;

export interface GeometryResult {
  triangles: number;
  trianglesUnique: number;
  lines: number;
  points: number;
  vertices: number;
  surfaces: number;
  objects: ObjectInfo[];
  bbox: Bounds | null;
  texelDensity: TexelDensity | null;
  attributes: Record<VertexAttribute, Presence>;
  morphTargets: number;
  usedMaterials: Set<Material>;
  /** Материал → число объектов (узлов), где он используется. */
  materialObjects: Map<Material, number>;
}

// ---------- чтение атрибутов ----------

const NORMALIZE: Record<string, number> = {
  Int8Array: 127,
  Uint8Array: 255,
  Int16Array: 32767,
  Uint16Array: 65535,
};

/** Плотный Float32Array с учётом normalized-целых (KHR_mesh_quantization). */
function readFloats(accessor: Accessor): Float32Array {
  const arr = accessor.getArray();
  if (!arr) return new Float32Array(0);
  if (arr instanceof Float32Array) return arr;
  const out = new Float32Array(arr.length);
  const div = accessor.getNormalized() ? NORMALIZE[arr.constructor.name] ?? 1 : 1;
  for (let i = 0; i < arr.length; i++) out[i] = div === 1 ? arr[i]! : Math.max(arr[i]! / div, -1);
  return out;
}

/** Треугольники примитива как тройки индексов вершин; null — режим не треугольный. */
function triangleIndices(prim: Primitive, vertexCount: number): Uint32Array | null {
  const mode = prim.getMode();
  const idx = prim.getIndices()?.getArray() ?? null;
  const n = idx ? idx.length : vertexCount;
  const at = (i: number) => (idx ? idx[i]! : i);
  if (mode === Primitive.Mode.TRIANGLES) {
    const out = new Uint32Array(Math.floor(n / 3) * 3);
    for (let i = 0; i < out.length; i++) out[i] = at(i);
    return out;
  }
  if (mode === Primitive.Mode.TRIANGLE_STRIP || mode === Primitive.Mode.TRIANGLE_FAN) {
    const tris = Math.max(0, n - 2);
    const out = new Uint32Array(tris * 3);
    for (let i = 0; i < tris; i++) {
      if (mode === Primitive.Mode.TRIANGLE_FAN) out.set([at(0), at(i + 1), at(i + 2)], i * 3);
      else out.set(i % 2 ? [at(i + 1), at(i), at(i + 2)] : [at(i), at(i + 1), at(i + 2)], i * 3);
    }
    return out;
  }
  return null;
}

/** Счётчики примитива по правилам раздела 5.2. */
function primitiveCounts(prim: Primitive) {
  const mode = prim.getMode();
  const count = prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0;
  switch (mode) {
    case Primitive.Mode.TRIANGLES:
      return { triangles: Math.floor(count / 3), lines: 0, points: 0 };
    case Primitive.Mode.TRIANGLE_STRIP:
    case Primitive.Mode.TRIANGLE_FAN:
      return { triangles: Math.max(0, count - 2), lines: 0, points: 0 };
    case Primitive.Mode.LINES:
      return { triangles: 0, lines: Math.floor(count / 2), points: 0 };
    case Primitive.Mode.LINE_LOOP:
      return { triangles: 0, lines: count, points: 0 };
    case Primitive.Mode.LINE_STRIP:
      return { triangles: 0, lines: Math.max(0, count - 1), points: 0 };
    case Primitive.Mode.POINTS:
      return { triangles: 0, lines: 0, points: count };
    default:
      return { triangles: 0, lines: 0, points: 0 };
  }
}

// ---------- текстура для плотности текселей ----------

interface DensityTexture {
  width: number;
  height: number;
  /** |scale.x × scale.y| из KHR_texture_transform: поворот и сдвиг площадь не меняют. */
  uvAreaScale: number;
}

function textureTransformScale(info: GltfTextureInfo | null): number {
  const t = info?.getExtension<Transform>('KHR_texture_transform');
  if (!t) return 1;
  const [sx, sy] = t.getScale();
  return Math.abs(sx * sy);
}

/** Base Color, а если её нет — первая текстура материала на texCoord 0. */
function densityTexture(material: Material | null): DensityTexture | null {
  if (!material) return null;
  const candidates: [Texture | null, GltfTextureInfo | null][] = [
    [material.getBaseColorTexture(), material.getBaseColorTextureInfo()],
    [material.getNormalTexture(), material.getNormalTextureInfo()],
    [material.getMetallicRoughnessTexture(), material.getMetallicRoughnessTextureInfo()],
    [material.getOcclusionTexture(), material.getOcclusionTextureInfo()],
    [material.getEmissiveTexture(), material.getEmissiveTextureInfo()],
  ];
  for (const [i, [tex, info]] of candidates.entries()) {
    if (!tex || !info) continue;
    if (i > 0 && info.getTexCoord() !== 0) continue;
    const size = tex.getSize();
    if (!size) continue;
    return { width: size[0], height: size[1], uvAreaScale: textureTransformScale(info) };
  }
  return null;
}

// ---------- матрицы ----------

function transformPositions(src: Float32Array, m: Mat4): Float32Array {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i]!;
    const y = src[i + 1]!;
    const z = src[i + 2]!;
    out[i] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
    out[i + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
    out[i + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  }
  return out;
}

function multiply(a: Mat4, b: Mat4): number[] {
  const out = new Array<number>(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r]! * b[c * 4 + k]!;
      out[c * 4 + r] = s;
    }
  return out;
}

function trs(t: ArrayLike<number>, q: ArrayLike<number>, s: ArrayLike<number>): number[] {
  const [x, y, z, w] = [q[0]!, q[1]!, q[2]!, q[3]!];
  const [sx, sy, sz] = [s[0]!, s[1]!, s[2]!];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0]!, t[1]!, t[2]!, 1,
  ];
}

/** Мировые матрицы экземпляров узла: одна, либо по одной на экземпляр EXT_mesh_gpu_instancing. */
function instanceMatrices(node: Node): Mat4[] {
  const world = node.getWorldMatrix();
  const inst = node.getExtension<InstancedMesh>('EXT_mesh_gpu_instancing');
  if (!inst) return [world];
  const T = inst.getAttribute('TRANSLATION');
  const R = inst.getAttribute('ROTATION');
  const S = inst.getAttribute('SCALE');
  const count = (T ?? R ?? S)?.getCount() ?? 1;
  const out: Mat4[] = [];
  const t = [0, 0, 0];
  const r = [0, 0, 0, 1];
  const s = [1, 1, 1];
  for (let i = 0; i < count; i++) {
    out.push(
      multiply(
        world,
        trs(T ? T.getElement(i, t) : [0, 0, 0], R ? R.getElement(i, r) : [0, 0, 0, 1], S ? S.getElement(i, s) : [1, 1, 1]),
      ),
    );
  }
  return out;
}

// ---------- обход ----------

function expand(b: Bounds, x: number, y: number, z: number) {
  if (x < b.min[0]) b.min[0] = x;
  if (y < b.min[1]) b.min[1] = y;
  if (z < b.min[2]) b.min[2] = z;
  if (x > b.max[0]) b.max[0] = x;
  if (y > b.max[1]) b.max[1] = y;
  if (z > b.max[2]) b.max[2] = z;
}

const emptyBounds = (): Bounds => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
const isEmpty = (b: Bounds) => b.min[0] > b.max[0];

/** Плотность текселей треугольников одного примитива в одной мировой матрице. */
function accumulateDensity(
  hist: DensityHistogram,
  world: Float32Array,
  uv: Float32Array,
  tris: Uint32Array,
  tex: DensityTexture,
): void {
  const texArea = tex.width * tex.height * tex.uvAreaScale;
  for (let t = 0; t < tris.length; t += 3) {
    const a = tris[t]!;
    const b = tris[t + 1]!;
    const c = tris[t + 2]!;
    const ax = world[a * 3]!, ay = world[a * 3 + 1]!, az = world[a * 3 + 2]!;
    const e1x = world[b * 3]! - ax, e1y = world[b * 3 + 1]! - ay, e1z = world[b * 3 + 2]! - az;
    const e2x = world[c * 3]! - ax, e2y = world[c * 3 + 1]! - ay, e2z = world[c * 3 + 2]! - az;
    const cx = e1y * e2z - e1z * e2y;
    const cy = e1z * e2x - e1x * e2z;
    const cz = e1x * e2y - e1y * e2x;
    const areaWorld = 0.5 * Math.sqrt(cx * cx + cy * cy + cz * cz);
    if (areaWorld < 1e-12) continue; // вырожденный
    const u0 = uv[a * 2]!, v0 = uv[a * 2 + 1]!;
    const areaUv = 0.5 * Math.abs((uv[b * 2]! - u0) * (uv[c * 2 + 1]! - v0) - (uv[c * 2]! - u0) * (uv[b * 2 + 1]! - v0));
    if (areaUv < 1e-14) continue;
    hist.add(Math.sqrt((areaUv * texArea) / areaWorld), areaWorld);
  }
}

export function analyzeGeometry(doc: Document, scene: Scene | null): GeometryResult {
  const result: GeometryResult = {
    triangles: 0,
    trianglesUnique: 0,
    lines: 0,
    points: 0,
    vertices: 0,
    surfaces: 0,
    objects: [],
    bbox: null,
    texelDensity: null,
    attributes: Object.fromEntries(VERTEX_ATTRIBUTES.map((a) => [a, 'none'])) as Record<VertexAttribute, Presence>,
    morphTargets: 0,
    usedMaterials: new Set(),
    materialObjects: new Map(),
  };
  if (!scene) return result;

  const nodeIndex = new Map(doc.getRoot().listNodes().map((n, i) => [n, i]));
  const seenMeshes = new Set<Mesh>();
  const seenPrims = new Set<Primitive>();
  const attrCounts = new Map<VertexAttribute, number>();
  const bbox = emptyBounds();
  const modelHist = new DensityHistogram();

  scene.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    const matrices = instanceMatrices(node);
    const instances = matrices.length;
    const firstSeen = !seenMeshes.has(mesh);
    seenMeshes.add(mesh);

    const objectHist = new DensityHistogram();
    const localBounds = emptyBounds();
    const objMaterials = new Set<Material>();
    let objTriangles = 0;
    let objVertices = 0;
    const prims = mesh.listPrimitives();

    for (const prim of prims) {
      const counts = primitiveCounts(prim);
      const position = prim.getAttribute('POSITION');
      const vertexCount = position?.getCount() ?? 0;
      objTriangles += counts.triangles * instances;
      objVertices += vertexCount * instances;
      result.lines += counts.lines * instances;
      result.points += counts.points * instances;
      if (firstSeen) result.trianglesUnique += counts.triangles;

      const material = prim.getMaterial();
      if (material) {
        objMaterials.add(material);
        result.usedMaterials.add(material);
      }

      if (!seenPrims.has(prim)) {
        seenPrims.add(prim);
        for (const a of VERTEX_ATTRIBUTES) if (prim.getAttribute(a)) attrCounts.set(a, (attrCounts.get(a) ?? 0) + 1);
        result.morphTargets = Math.max(result.morphTargets, prim.listTargets().length);
      }

      if (!position) continue;
      const local = readFloats(position);
      for (let i = 0; i < local.length; i += 3) expand(localBounds, local[i]!, local[i + 1]!, local[i + 2]!);

      // Мировые координаты: точный AABB по вершинам первого экземпляра; остальные — по углам локального AABB.
      const world = transformPositions(local, matrices[0]!);
      for (let i = 0; i < world.length; i += 3) expand(bbox, world[i]!, world[i + 1]!, world[i + 2]!);

      const uvAccessor = prim.getAttribute('TEXCOORD_0');
      const tex = densityTexture(material);
      if (uvAccessor && tex) {
        const tris = triangleIndices(prim, vertexCount);
        if (tris) accumulateDensity(objectHist, world, readFloats(uvAccessor), tris, tex);
      }
    }

    if (instances > 1 && !isEmpty(localBounds)) {
      for (const m of matrices.slice(1)) {
        for (let i = 0; i < 8; i++) {
          const x = i & 1 ? localBounds.max[0] : localBounds.min[0];
          const y = i & 2 ? localBounds.max[1] : localBounds.min[1];
          const z = i & 4 ? localBounds.max[2] : localBounds.min[2];
          expand(
            bbox,
            m[0]! * x + m[4]! * y + m[8]! * z + m[12]!,
            m[1]! * x + m[5]! * y + m[9]! * z + m[13]!,
            m[2]! * x + m[6]! * y + m[10]! * z + m[14]!,
          );
        }
      }
    }

    for (const mat of objMaterials) result.materialObjects.set(mat, (result.materialObjects.get(mat) ?? 0) + 1);
    modelHist.merge(objectHist);
    result.triangles += objTriangles;
    result.vertices += objVertices;
    result.surfaces += prims.length;
    result.objects.push({
      nodeIndex: nodeIndex.get(node) ?? -1,
      name: node.getName() || `node_${nodeIndex.get(node) ?? '?'}`,
      meshName: mesh.getName(),
      instances,
      triangles: objTriangles,
      vertices: objVertices,
      surfaces: prims.length,
      materials: [...objMaterials].map((m) => m.getName() || '(без имени)'),
      texelDensity: objectHist.result(),
      localBounds: isEmpty(localBounds) ? null : localBounds,
    });
  });

  const total = seenPrims.size;
  for (const a of VERTEX_ATTRIBUTES) {
    const n = attrCounts.get(a) ?? 0;
    result.attributes[a] = n === 0 ? 'none' : n === total ? 'all' : 'some';
  }
  result.bbox = isEmpty(bbox) ? null : bbox;
  result.texelDensity = modelHist.result();
  return result;
}
