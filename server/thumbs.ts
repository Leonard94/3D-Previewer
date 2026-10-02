import fs from 'node:fs/promises';
import path from 'node:path';

/** Форматы миниатюр: WebP по ТЗ; PNG — если браузер не умеет кодировать WebP (Safari). */
const FORMATS = {
  webp: 'image/webp',
  png: 'image/png',
} as const;

export type ThumbFormat = keyof typeof FORMATS;

export const THUMB_MAX_BYTES = 8 * 1024 * 1024;

export const isThumbHash = (s: string) => /^[0-9a-f]{40}$/.test(s);

/** Формат по сигнатуре файла; null — не картинка нужного формата. */
export function sniffThumb(buf: Buffer): ThumbFormat | null {
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  if (buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  return null;
}

/**
 * Миниатюры моделей: `.cache/thumbs/<sha1 .glb>.webp`. Только в папке приложения —
 * Godot импортирует любые картинки внутри проекта.
 */
export class ThumbStore {
  private readonly dir: string;
  /** hash → формат файла на диске. */
  private readonly files = new Map<string, ThumbFormat>();

  constructor(cacheDir: string) {
    this.dir = path.join(cacheDir, 'thumbs');
  }

  async init(): Promise<void> {
    let names: string[] = [];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return;
    }
    for (const name of names) {
      const [hash, ext] = name.split('.');
      if (hash && isThumbHash(hash) && (ext === 'webp' || ext === 'png')) this.files.set(hash, ext);
    }
  }

  has(hash: string): boolean {
    return this.files.has(hash);
  }

  /** Путь и MIME-тип миниатюры; null — нет. */
  get(hash: string): { file: string; mimeType: string } | null {
    const format = this.files.get(hash);
    return format ? { file: this.file(hash, format), mimeType: FORMATS[format] } : null;
  }

  async save(hash: string, data: Buffer, format: ThumbFormat): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const target = this.file(hash, format);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, data);
    await fs.rename(tmp, target);
    const prev = this.files.get(hash);
    if (prev && prev !== format) await fs.rm(this.file(hash, prev), { force: true });
    this.files.set(hash, format);
  }

  /** Удаляет миниатюры моделей, которых больше нет. */
  async prune(liveHashes: Set<string>): Promise<number> {
    const stale = [...this.files].filter(([hash]) => !liveHashes.has(hash));
    await Promise.all(stale.map(([hash, format]) => fs.rm(this.file(hash, format), { force: true })));
    for (const [hash] of stale) this.files.delete(hash);
    return stale.length;
  }

  /** «Перегенерировать все миниатюры». */
  async clear(): Promise<void> {
    await Promise.all([...this.files].map(([hash, format]) => fs.rm(this.file(hash, format), { force: true })));
    this.files.clear();
  }

  private file(hash: string, format: ThumbFormat): string {
    return path.join(this.dir, `${hash}.${format}`);
  }
}
