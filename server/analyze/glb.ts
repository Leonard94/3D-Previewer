const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN'

/** Кусок glTF JSON, который читаем напрямую (до и помимо gltf-transform). */
export interface GltfJson {
  asset?: { version?: string };
  scene?: number;
  scenes?: { nodes?: number[]; extras?: unknown }[];
  nodes?: { extras?: unknown }[];
  images?: { uri?: string; bufferView?: number; mimeType?: string; name?: string }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[];
  buffers?: { uri?: string; byteLength: number }[];
  extensionsUsed?: string[];
  extensionsRequired?: string[];
  [key: string]: unknown;
}

export interface ParsedGlb {
  json: GltfJson;
  jsonByteLength: number;
  /** Смещение данных BIN-чанка от начала файла; null — чанка нет. */
  binOffset: number | null;
}

/** Разбирает заголовок GLB и JSON-чанк. Бросает понятную ошибку на битом файле. */
export function parseGlb(buf: Uint8Array): ParsedGlb {
  if (buf.byteLength < 20) throw new Error('файл слишком короткий для GLB');
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (view.getUint32(0, true) !== GLB_MAGIC) throw new Error('это не GLB (нет сигнатуры glTF)');
  const version = view.getUint32(4, true);
  if (version !== 2) throw new Error(`неподдерживаемая версия GLB: ${version}`);
  const totalLength = view.getUint32(8, true);
  if (totalLength > buf.byteLength) throw new Error('файл обрезан: длина в заголовке больше размера файла');
  const jsonLength = view.getUint32(12, true);
  if (view.getUint32(16, true) !== CHUNK_JSON) throw new Error('первый чанк GLB — не JSON');
  if (20 + jsonLength > totalLength) throw new Error('JSON-чанк выходит за пределы файла');

  let json: GltfJson;
  try {
    json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + jsonLength))) as GltfJson;
  } catch (err) {
    throw new Error(`битый JSON внутри GLB: ${(err as Error).message}`);
  }

  let binOffset: number | null = null;
  const binHeader = 20 + jsonLength;
  if (binHeader + 8 <= totalLength && view.getUint32(binHeader + 4, true) === CHUNK_BIN) binOffset = binHeader + 8;
  return { json, jsonByteLength: jsonLength, binOffset };
}

/** Где в файле лежат байты встроенного изображения (для превью без повторного парсинга). */
export interface ImageRange {
  offset: number;
  length: number;
  mimeType: string;
}

export function imageRanges(glb: ParsedGlb): (ImageRange | null)[] {
  const { json, binOffset } = glb;
  return (json.images ?? []).map((img) => {
    if (img.bufferView === undefined || binOffset === null) return null;
    const bv = json.bufferViews?.[img.bufferView];
    if (!bv || bv.buffer !== 0) return null;
    return { offset: binOffset + (bv.byteOffset ?? 0), length: bv.byteLength, mimeType: img.mimeType ?? '' };
  });
}
