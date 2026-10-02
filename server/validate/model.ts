// Проверки по разобранной модели (W3–W10, I1–I4): трансформации, габариты, атрибуты, материалы.
import { createHash } from 'node:crypto';
import {
  Primitive,
  type Document,
  type TextureInfo,
  type Material,
  type Mesh,
  type Node,
  type Scene,
} from '@gltf-transform/core';
import type { Bounds, Issue, IssueTarget, MaterialInfo, ModelMeta, TextureInfo as TextureStats } from '../../shared/types.ts';
import { counted, formatDistance, formatMeters, formatVec } from './format.ts';

const SCALE_EPS = 1e-4;
const ROTATION_EPS = 1e-4;
/** W5: подозрительно большой или маленький габарит, м. */
const MAX_SIZE = 200;
const MIN_SIZE = 0.01;
/** W6: допуск по высоте нижней точки над полом, м. */
const FLOOR_EPS = 0.01;
/** I2: имена материалов по умолчанию в Blender. */
const DEFAULT_MATERIAL_NAME = /^Material(\.\d+)?$/;
/** Сколько строк подробностей показывать у проверок по объектам. */
const MAX_DETAILS = 20;

const TRIANGLE_MODES: ReadonlySet<number> = new Set([
  Primitive.Mode.TRIANGLES as number,
  Primitive.Mode.TRIANGLE_STRIP as number,
  Primitive.Mode.TRIANGLE_FAN as number,
]);

export interface ModelCheckInput {
  doc: Document;
  scene: Scene | null;
  meta: ModelMeta;
  bbox: Bounds | null;
  textures: TextureStats[];
  materials: MaterialInfo[];
}

const isUnitScale = (s: ArrayLike<number>) => Array.from(s).every((v) => Math.abs(v - 1) <= SCALE_EPS);

function determinant3(m: ArrayLike<number>): number {
  return (
    m[0]! * (m[5]! * m[10]! - m[6]! * m[9]!) -
    m[4]! * (m[1]! * m[10]! - m[2]! * m[9]!) +
    m[8]! * (m[1]! * m[6]! - m[2]! * m[5]!)
  );
}

function capped(lines: string[]): string[] {
  return lines.length > MAX_DETAILS ? [...lines.slice(0, MAX_DETAILS), `…и ещё ${lines.length - MAX_DETAILS}`] : lines;
}

/** Текстурные слоты материала и их texCoord. */
function textureSlots(m: Material): [string, number][] {
  const slots: [string, unknown, TextureInfo | null][] = [
    ['Base Color', m.getBaseColorTexture(), m.getBaseColorTextureInfo()],
    ['Normal', m.getNormalTexture(), m.getNormalTextureInfo()],
    ['Metallic-Roughness', m.getMetallicRoughnessTexture(), m.getMetallicRoughnessTextureInfo()],
    ['Occlusion', m.getOcclusionTexture(), m.getOcclusionTextureInfo()],
    ['Emission', m.getEmissiveTexture(), m.getEmissiveTextureInfo()],
  ];
  return slots.flatMap(([name, tex, info]) => (tex && info ? [[name, info.getTexCoord()] as [string, number]] : []));
}

export function checkModel({ doc, scene, meta, bbox, textures, materials }: ModelCheckInput): Issue[] {
  const issues: Issue[] = [];
  const root = doc.getRoot();
  const nodeIndex = new Map(root.listNodes().map((n, i) => [n, i]));
  const materialIndex = new Map(root.listMaterials().map((m, i) => [m, i]));
  const objectTarget = (node: Node): IssueTarget => ({
    kind: 'object',
    name: node.getName() || `node_${nodeIndex.get(node) ?? '?'}`,
    index: nodeIndex.get(node),
  });
  const materialName = (m: Material) => materials[materialIndex.get(m) ?? -1]?.name ?? (m.getName() || '(без имени)');

  // ---------- обход объектов ----------
  const scaled: IssueTarget[] = [];
  const scaledDetails: string[] = [];
  const negative: IssueTarget[] = [];
  const noUv: IssueTarget[] = [];
  const noNormals: IssueTarget[] = [];
  const missingTexCoord = new Map<Material, Set<string>>();
  const missingTexCoordObjects: IssueTarget[] = [];
  const usedMeshes = new Set<Mesh>();

  scene?.traverse((node) => {
    const mesh = node.getMesh();
    if (!mesh) return;
    usedMeshes.add(mesh);
    const target = objectTarget(node);

    // W3 — неприменённый масштаб у самого узла или у предка.
    for (let n: Node | null = node; n; n = n.getParentNode()) {
      const s = n.getScale();
      if (isUnitScale(s)) continue;
      scaled.push(target);
      scaledDetails.push(
        n === node ? `${target.name}: ${formatVec(s)}` : `${target.name}: через родителя «${n.getName() || '?'}» (${formatVec(s)})`,
      );
      break;
    }

    // W4 — отрицательный масштаб (зеркалирование).
    if (determinant3(node.getWorldMatrix()) < 0) negative.push(target);

    let objNoUv = false;
    let objNoNormals = false;
    let objMissing = false;
    for (const prim of mesh.listPrimitives()) {
      if (!TRIANGLE_MODES.has(prim.getMode())) continue;
      if (!prim.getAttribute('NORMAL')) objNoNormals = true;
      const material = prim.getMaterial();
      if (!material) continue;
      const hasTextures = (materials[materialIndex.get(material) ?? -1]?.textures.length ?? 0) > 0;
      if (hasTextures && !prim.getAttribute('TEXCOORD_0')) objNoUv = true;
      // W9 — текстура на texCoord N, а TEXCOORD_N в меше нет (texCoord 0 уже покрывает W7).
      for (const [slot, texCoord] of textureSlots(material)) {
        if (texCoord === 0 || prim.getAttribute(`TEXCOORD_${texCoord}`)) continue;
        objMissing = true;
        let set = missingTexCoord.get(material);
        if (!set) missingTexCoord.set(material, (set = new Set()));
        set.add(`${slot} → TEXCOORD_${texCoord}`);
      }
    }
    if (objNoUv) noUv.push(target);
    if (objNoNormals) noNormals.push(target);
    if (objMissing) missingTexCoordObjects.push(target);
  });

  if (scaled.length > 0) {
    issues.push({
      code: 'W3',
      level: 'warning',
      message: `Неприменённый масштаб: ${counted(scaled.length, ['объект', 'объекта', 'объектов'])}`,
      hint: 'Выделить объекты → Ctrl+A → Scale',
      targets: scaled,
      details: capped(scaledDetails),
    });
  }

  if (negative.length > 0) {
    issues.push({
      code: 'W4',
      level: 'warning',
      message: `Отрицательный масштаб (зеркалирование): ${counted(negative.length, ['объект', 'объекта', 'объектов'])}`,
      hint: 'Нормали вывернуты: Ctrl+A → Scale, затем пересчитать нормали (Shift+N)',
      targets: negative,
    });
  }

  // ---------- габариты ----------
  if (bbox) {
    const size = [0, 1, 2].map((i) => bbox.max[i]! - bbox.min[i]!);
    const maxSize = Math.max(...size);
    if (maxSize > MAX_SIZE || maxSize < MIN_SIZE) {
      issues.push({
        code: 'W5',
        level: 'warning',
        message: `Подозрительный размер: наибольший габарит ${formatMeters(maxSize)}`,
        hint: 'Проверить единицы: метры, Unit Scale = 1 (Scene Properties → Units)',
      });
    }

    const minY = bbox.min[1];
    if (Math.abs(minY) > FLOOR_EPS && meta.placement !== 'wall') {
      issues.push({
        code: 'W6',
        level: 'warning',
        message:
          minY > 0
            ? `Модель не стоит на полу: парит на ${formatDistance(minY)}`
            : `Модель не стоит на полу: уходит под пол на ${formatDistance(minY)}`,
        hint: 'Перенести Origin в низ модели и поставить её на Z = 0. Для настенных моделей — Custom Property placement = wall',
      });
    }
  }

  // ---------- атрибуты ----------
  if (noUv.length > 0) {
    issues.push({
      code: 'W7',
      level: 'warning',
      message: `Нет UV-развёртки (TEXCOORD_0) при текстурах: ${counted(noUv.length, ['объект', 'объекта', 'объектов'])}`,
      hint: 'Сделать UV-развёртку (U → Unwrap) и включить UVs при экспорте',
      targets: noUv,
    });
  }

  if (noNormals.length > 0) {
    issues.push({
      code: 'W8',
      level: 'warning',
      message: `Нет нормалей: ${counted(noNormals.length, ['объект', 'объекта', 'объектов'])}`,
      hint: 'Включить Normals при экспорте (Data → Mesh)',
      targets: noNormals,
    });
  }

  if (missingTexCoord.size > 0) {
    issues.push({
      code: 'W9',
      level: 'warning',
      message: 'Текстура ссылается на UV-канал, которого нет в меше',
      targets: [
        ...[...missingTexCoord.keys()].map((m): IssueTarget => ({ kind: 'material', name: materialName(m) })),
        ...missingTexCoordObjects,
      ],
      details: capped([...missingTexCoord].map(([m, slots]) => `${materialName(m)}: ${[...slots].join(', ')}`)),
    });
  }

  // ---------- текстуры ----------
  const byHash = new Map<string, number[]>();
  root.listTextures().forEach((texture, index) => {
    const image = texture.getImage();
    if (!image || image.byteLength === 0) return;
    const hash = createHash('sha1').update(image).digest('hex');
    byHash.set(hash, [...(byHash.get(hash) ?? []), index]);
  });
  const duplicates = [...byHash.values()].filter((g) => g.length > 1);
  if (duplicates.length > 0) {
    const name = (i: number) => textures[i]?.name ?? `image_${i}`;
    const extra = duplicates.reduce((s, g) => s + g.length - 1, 0);
    issues.push({
      code: 'W10',
      level: 'warning',
      message: `Одинаковые изображения встроены несколько раз: ${counted(extra, ['лишняя копия', 'лишние копии', 'лишних копий'])}`,
      hint: 'Лишний вес файла и VRAM — использовать одно изображение во всех материалах',
      targets: duplicates.flat().map((i): IssueTarget => ({ kind: 'texture', name: name(i), index: i })),
      details: duplicates.map((g) => g.map(name).join(' = ')),
    });
  }

  // ---------- инфо ----------
  const missingMeta = [!meta.title && 'title', meta.tags.length === 0 && 'tags'].filter(Boolean);
  if (missingMeta.length > 0) {
    issues.push({
      code: 'I1',
      level: 'info',
      message: `Нет метаданных: ${missingMeta.join(', ')}`,
      hint: 'Properties → Scene → Custom Properties → New (тип String); при экспорте включить Include → Custom Properties',
    });
  }

  const defaultNamed = materials.filter((m) => DEFAULT_MATERIAL_NAME.test(m.name));
  if (defaultNamed.length > 0) {
    issues.push({
      code: 'I2',
      level: 'info',
      message: `Материалы с именами по умолчанию: ${defaultNamed.map((m) => m.name).join(', ')}`,
      hint: 'Переименовать материалы — в Godot их будет проще найти',
      targets: defaultNamed.map((m): IssueTarget => ({ kind: 'material', name: m.name })),
    });
  }

  const unusedMaterials = materials.filter((m) => !m.used);
  const usedTextures = new Set(materials.filter((m) => m.used).flatMap((m) => m.textures));
  const unusedTextures = textures.filter((t) => !usedTextures.has(t.index));
  const unusedMeshes = root.listMeshes().filter((m) => !usedMeshes.has(m));
  if (unusedMaterials.length + unusedTextures.length + unusedMeshes.length > 0) {
    const parts = [
      unusedMaterials.length > 0 && counted(unusedMaterials.length, ['материал', 'материала', 'материалов']),
      unusedTextures.length > 0 && counted(unusedTextures.length, ['текстура', 'текстуры', 'текстур']),
      unusedMeshes.length > 0 && counted(unusedMeshes.length, ['меш', 'меша', 'мешей']),
    ].filter(Boolean);
    issues.push({
      code: 'I3',
      level: 'info',
      message: `В файле есть неиспользуемые данные: ${parts.join(', ')}`,
      hint: 'File → Clean Up → Purge Unused Data, затем переэкспортировать',
      targets: [
        ...unusedMaterials.map((m): IssueTarget => ({ kind: 'material', name: m.name })),
        ...unusedTextures.map((t): IssueTarget => ({ kind: 'texture', name: t.name, index: t.index })),
      ],
      details: unusedMeshes.length > 0 ? [`Меши: ${unusedMeshes.map((m) => m.getName() || '(без имени)').join(', ')}`] : undefined,
    });
  }

  const rotated = (scene?.listChildren() ?? []).filter((n) => {
    if (!n.getMesh()) return false;
    const [x, y, z] = n.getRotation();
    return Math.abs(x) > ROTATION_EPS || Math.abs(y) > ROTATION_EPS || Math.abs(z) > ROTATION_EPS;
  });
  if (rotated.length > 0) {
    issues.push({
      code: 'I4',
      level: 'info',
      message: `Неприменённый поворот у корневых объектов: ${rotated.length}`,
      hint: 'Ctrl+A → Rotation (если поворот не нужен самой игре)',
      targets: rotated.map(objectTarget),
    });
  }

  return issues;
}
