// Типы API, общие для сервера и фронта.

export type IssueLevel = 'error' | 'warning' | 'info';

export interface IssueTarget {
  kind: 'object' | 'material' | 'texture';
  name: string;
  /** Для объектов — индекс узла glTF (связь с three.js); для текстур — индекс изображения. */
  index?: number;
}

/**
 * Одна проблема одного вида (код). Если она касается нескольких объектов, материалов
 * или текстур — все они в targets, а не отдельными сообщениями.
 */
export interface Issue {
  code: string; // 'W3'
  level: IssueLevel;
  message: string;
  /** Как исправить в Blender. */
  hint?: string;
  targets?: IssueTarget[];
  /** Подробности: сообщения валидатора, значения масштаба и т. п. */
  details?: string[];
}

export interface ModelMeta {
  title: string | null;
  tags: string[];
  description: string | null;
  /** Custom Property `placement`: 'wall' отключает проверку «не стоит на полу» (W6). */
  placement: string | null;
}

export interface ModelSummary {
  id: string; // 'street/mailbox/mailbox.glb'
  modelDir: string; // 'street/mailbox'
  fileName: string; // 'mailbox.glb'
  blendFile: string | null; // 'mailbox.blend'
  blendMtime: number | null;
  title: string;
  tags: string[];
  description?: string;
  fileSize: number;
  mtime: number;
  hash: string; // sha1 содержимого .glb
  triangles: number | null; // null — ещё не посчитано или файл битый
  vertices: number | null;
  maxTextureSize: number | null; // макс. сторона среди текстур
  issueCounts: Record<IssueLevel, number>;
  hasThumb: boolean;
  analysisError?: string;
}

// ---------- анализ (раздел 5) ----------

export type Vec3 = [number, number, number];

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** Есть ли атрибут вершин: во всех примитивах, в части или ни в одном. */
export type Presence = 'all' | 'some' | 'none';

export const VERTEX_ATTRIBUTES = ['NORMAL', 'TANGENT', 'TEXCOORD_0', 'TEXCOORD_1', 'COLOR_0', 'JOINTS_0', 'WEIGHTS_0'] as const;
export type VertexAttribute = (typeof VERTEX_ATTRIBUTES)[number];

/** Плотность текселей, px/м: медиана и p10–p90, взвешенные по площади. */
export interface TexelDensity {
  median: number;
  p10: number;
  p90: number;
}

export interface ModelStats {
  /** По экземплярам: каждый узел с мешем отдельно, GPU-инстансинг умножает. */
  triangles: number;
  /** Каждый меш один раз. */
  trianglesUnique: number;
  lines: number;
  points: number;
  /** Вершины для видеокарты — с разрезами по UV-швам и жёстким рёбрам. */
  vertices: number;
  /** Узлы с мешем. */
  objects: number;
  /** Примитивы по всем экземплярам ≈ вызовы отрисовки за проход. */
  surfaces: number;
  materials: { total: number; opaque: number; mask: number; blend: number; doubleSided: number; unlit: number };
  textures: {
    count: number;
    maxWidth: number;
    maxHeight: number;
    fileBytes: number;
    vramUncompressed: number;
    /** Оценка для Godot (VRAM Compressed); KTX2 не входят — они уже сжаты. */
    vramGodot: number;
    compressedCount: number;
  };
  size: Vec3;
  /** Высота нижней точки над полом. */
  minY: number;
  fileBytes: { total: number; images: number; geometry: number; other: number };
  attributes: Record<VertexAttribute, Presence>;
  morphTargets: number;
}

export type TextureSlot = 'baseColor' | 'normal' | 'metallicRoughness' | 'occlusion' | 'orm' | 'emissive' | 'other';

export interface TextureInfo {
  index: number;
  name: string;
  slots: TextureSlot[];
  width: number;
  height: number;
  pot: boolean;
  mimeType: string;
  fileBytes: number;
  /** used — альфа есть и реально используется; unused — канал есть, но всё непрозрачно; null — неизвестно (KTX2). */
  alpha: 'used' | 'unused' | 'none' | null;
  vramUncompressed: number;
  /** null — уже сжатая (KTX2). */
  vramGodot: number | null;
  godotFormat: 'BC5' | 'BC3/BC7' | 'BC1' | null;
  materialCount: number;
  hasPreview: boolean;
}

export interface MaterialInfo {
  index: number;
  name: string;
  alphaMode: 'OPAQUE' | 'MASK' | 'BLEND';
  doubleSided: boolean;
  unlit: boolean;
  textures: number[];
  objectCount: number;
  used: boolean;
}

export interface ObjectInfo {
  /** Индекс узла в glTF — по нему объект находится в three.js (parser.associations). */
  nodeIndex: number;
  name: string;
  meshName: string;
  instances: number;
  triangles: number;
  vertices: number;
  surfaces: number;
  materials: string[];
  texelDensity: TexelDensity | null;
  localBounds: Bounds | null;
}

export interface ModelDetails extends ModelSummary {
  glbPath: string; // абсолютный путь
  blendPath: string | null;
  stats: ModelStats | null; // null — файл не прочитался
  textures: TextureInfo[];
  materials: MaterialInfo[];
  objects: ObjectInfo[];
  issues: Issue[];
  bbox: Bounds | null;
  texelDensity: TexelDensity | null;
  extensionsUsed: string[];
  extensionsRequired: string[];
}

export type ModelsDirSource = 'cli' | 'env' | 'config';

export interface ConfigResponse {
  modelsDir: string;
  modelsDirExists: boolean;
  modelsDirSource: ModelsDirSource;
}

export interface ConfigUpdate {
  modelsDir: string;
}

/**
 * События WebSocket. Сверх ТЗ: 'thumb' — готова миниатюра (без подсветки карточки как «изменённой»),
 * 'thumbs-reset' — все миниатюры удалены и будут сгенерированы заново.
 */
export interface ServerEvent {
  type: 'added' | 'changed' | 'removed' | 'config-changed' | 'thumb' | 'thumbs-reset';
  id?: string;
  summary?: ModelSummary;
}

export interface ApiError {
  error: string;
}
