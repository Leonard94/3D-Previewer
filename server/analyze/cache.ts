import fs from 'node:fs/promises';
import path from 'node:path';
import { ANALYZER_VERSION, type ModelAnalysis } from './index.ts';

/** Кеш анализа: `.cache/analysis/<sha1>-v<версия>.json`. */
export class AnalysisCache {
  private readonly dir: string;

  constructor(cacheDir: string) {
    this.dir = path.join(cacheDir, 'analysis');
  }

  private file(hash: string): string {
    return path.join(this.dir, `${hash}-v${ANALYZER_VERSION}.json`);
  }

  async get(hash: string): Promise<ModelAnalysis | null> {
    try {
      const data = JSON.parse(await fs.readFile(this.file(hash), 'utf8')) as ModelAnalysis;
      return data.version === ANALYZER_VERSION ? data : null;
    } catch {
      return null;
    }
  }

  async set(hash: string, analysis: ModelAnalysis): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const target = this.file(hash);
    const tmp = `${target}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(analysis));
    await fs.rename(tmp, target);
  }

  /**
   * Удаляет записи старых версий анализатора. Записи отсутствующих файлов не трогаем:
   * они маленькие, а при возврате к прежней папке моделей не придётся анализировать всё заново.
   */
  async pruneOldVersions(): Promise<number> {
    let names: string[];
    try {
      names = await fs.readdir(this.dir);
    } catch {
      return 0;
    }
    const suffix = `-v${ANALYZER_VERSION}.json`;
    const stale = names.filter((name) => !name.endsWith(suffix));
    await Promise.all(stale.map((name) => fs.rm(path.join(this.dir, name), { force: true })));
    return stale.length;
  }
}
