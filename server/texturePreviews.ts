import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { ImageRange } from './analyze/glb.ts';

export const PREVIEW_SIZE = 128;

/** Байты встроенного изображения прямо из .glb (по смещению, сохранённому при анализе). */
export async function readImageBytes(glbPath: string, range: ImageRange): Promise<Buffer> {
  const fh = await fs.open(glbPath, 'r');
  try {
    const buf = Buffer.alloc(range.length);
    const { bytesRead } = await fh.read(buf, 0, range.length, range.offset);
    if (bytesRead !== range.length) throw new Error('файл изменился во время чтения');
    return buf;
  } finally {
    await fh.close();
  }
}

/**
 * Превью текстуры 128 px (PNG). Генерируется по запросу и кешируется
 * в .cache/texture-previews/<хеш модели>-<индекс>.png — не в папке моделей.
 */
export async function getTexturePreview(cacheDir: string, hash: string, index: number, glbPath: string, range: ImageRange): Promise<Buffer> {
  const dir = path.join(cacheDir, 'texture-previews');
  const file = path.join(dir, `${hash}-${index}.png`);
  try {
    return await fs.readFile(file);
  } catch {
    // нет в кеше
  }
  const source = await readImageBytes(glbPath, range);
  const png = await sharp(source)
    .resize(PREVIEW_SIZE, PREVIEW_SIZE, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, png);
  await fs.rename(tmp, file);
  return png;
}

/** Удаляет превью моделей, которых больше нет (по хешу). */
export async function pruneTexturePreviews(cacheDir: string, liveHashes: Set<string>): Promise<void> {
  const dir = path.join(cacheDir, 'texture-previews');
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return;
  }
  await Promise.all(
    names
      .filter((n) => !liveHashes.has(n.split('-')[0]!))
      .map((n) => fs.rm(path.join(dir, n), { force: true })),
  );
}
