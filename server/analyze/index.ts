import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  Bounds,
  Issue,
  MaterialInfo,
  ModelMeta,
  ModelStats,
  ObjectInfo,
  TexelDensity,
  TextureInfo,
} from '../../shared/types.ts';
import { checkFile, checkModel } from '../validate/index.ts';
import { analyzeGeometry } from './geometry.ts';
import { imageRanges, parseGlb, type ImageRange, type ParsedGlb } from './glb.ts';
import { getIO } from './io.ts';
import { readMeta } from './meta.ts';
import { analyzeTextures } from './textures.ts';

/** Увеличивать при любом изменении логики анализа — старый кеш перестанет использоваться. */
export const ANALYZER_VERSION = 5;

/** Результат анализа, который зависит только от содержимого .glb и кешируется по его хешу. */
export interface ModelAnalysis {
  version: number;
  meta: ModelMeta;
  stats: ModelStats;
  textures: TextureInfo[];
  materials: MaterialInfo[];
  objects: ObjectInfo[];
  bbox: Bounds | null;
  texelDensity: TexelDensity | null;
  extensionsUsed: string[];
  extensionsRequired: string[];
  /** Проверки по содержимому файла (E2–E4, W1–W10, I1–I4). */
  issues: Issue[];
  /** Где лежат байты встроенных изображений — для превью без повторного парсинга. */
  imageRanges: (ImageRange | null)[];
}

/** Файл не разобрался целиком, но часть проверок (валидатор, E3, E4) уже есть. */
export class AnalysisFailure extends Error {
  constructor(
    message: string,
    readonly issues: Issue[],
  ) {
    super(message);
  }
}

export async function analyzeGlb(filePath: string): Promise<ModelAnalysis> {
  const file = await fs.readFile(filePath);
  const bytes = new Uint8Array(file.buffer, file.byteOffset, file.byteLength);
  const glb = parseGlb(bytes);
  const fileIssues = await checkFile(glb.json, bytes);
  try {
    return await analyzeParsed(filePath, file, glb, fileIssues);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    // Невстроенный ресурс, которого нет рядом: путь — относительно папки модели, а не абсолютный.
    const message =
      e?.code === 'ENOENT' && e.path
        ? `не найден внешний файл ${path.relative(path.dirname(filePath), e.path)}`
        : e?.message || String(err);
    throw new AnalysisFailure(message, fileIssues);
  }
}

async function analyzeParsed(filePath: string, file: Buffer, glb: ParsedGlb, fileIssues: Issue[]): Promise<ModelAnalysis> {
  const { json } = glb;
  const io = await getIO();
  // По пути, а не из байтов: невстроенные ресурсы (E3) найдутся рядом с файлом, если они есть.
  const doc = await io.read(filePath);
  const root = doc.getRoot();
  const scene = root.getDefaultScene() ?? root.listScenes()[0] ?? null;

  const geo = analyzeGeometry(doc, scene);
  const ranges = imageRanges(glb);
  const { textures, materials } = await analyzeTextures(
    doc,
    geo.usedMaterials,
    geo.materialObjects,
    ranges.map((r) => r !== null),
  );

  const used = materials.filter((m) => m.used);
  const imageBytes = textures.reduce((s, t) => s + t.fileBytes, 0);
  // Геометрия — данные аксессоров; для Draco это уже распакованный объём, поэтому ограничиваем сверху.
  const accessorBytes = root.listAccessors().reduce((s, a) => s + (a.getArray()?.byteLength ?? 0), 0);
  const geometryBytes = Math.max(0, Math.min(accessorBytes, file.byteLength - imageBytes - glb.jsonByteLength));
  const size: [number, number, number] = geo.bbox
    ? [geo.bbox.max[0] - geo.bbox.min[0], geo.bbox.max[1] - geo.bbox.min[1], geo.bbox.max[2] - geo.bbox.min[2]]
    : [0, 0, 0];

  const stats: ModelStats = {
    triangles: geo.triangles,
    trianglesUnique: geo.trianglesUnique,
    lines: geo.lines,
    points: geo.points,
    vertices: geo.vertices,
    objects: geo.objects.length,
    surfaces: geo.surfaces,
    materials: {
      total: used.length,
      opaque: used.filter((m) => m.alphaMode === 'OPAQUE').length,
      mask: used.filter((m) => m.alphaMode === 'MASK').length,
      blend: used.filter((m) => m.alphaMode === 'BLEND').length,
      doubleSided: used.filter((m) => m.doubleSided).length,
      unlit: used.filter((m) => m.unlit).length,
    },
    textures: {
      count: textures.length,
      maxWidth: Math.max(0, ...textures.map((t) => t.width)),
      maxHeight: Math.max(0, ...textures.map((t) => t.height)),
      fileBytes: imageBytes,
      vramUncompressed: textures.reduce((s, t) => s + t.vramUncompressed, 0),
      vramGodot: textures.reduce((s, t) => s + (t.vramGodot ?? 0), 0),
      compressedCount: textures.filter((t) => t.vramGodot === null).length,
    },
    size,
    minY: geo.bbox ? geo.bbox.min[1] : 0,
    fileBytes: {
      total: file.byteLength,
      images: imageBytes,
      geometry: geometryBytes,
      other: Math.max(0, file.byteLength - imageBytes - geometryBytes),
    },
    attributes: geo.attributes,
    morphTargets: geo.morphTargets,
  };

  const meta = readMeta(json);
  const modelIssues = checkModel({ doc, scene, meta, bbox: geo.bbox, textures, materials });

  return {
    version: ANALYZER_VERSION,
    meta,
    stats,
    textures,
    materials,
    objects: geo.objects,
    bbox: geo.bbox,
    texelDensity: geo.texelDensity,
    extensionsUsed: json.extensionsUsed ?? [],
    extensionsRequired: json.extensionsRequired ?? [],
    issues: [...fileIssues, ...modelIssues],
    imageRanges: ranges,
  };
}
