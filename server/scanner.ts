import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { Issue, ModelDetails, ModelSummary, ServerEvent } from '../shared/types.ts';
import type { ModelAnalysis } from './analyze/index.ts';
import { AnalysisCache } from './analyze/cache.ts';
import { AnalyzeError, AnalyzerPool } from './analyze/pool.ts';
import { titleFromFileName } from './analyze/meta.ts';
import { isReadableDir } from './config.ts';
import type { ThumbStore } from './thumbs.ts';
import { countIssues, environmentIssues, sortIssues } from './validate/index.ts';

const GLB_RE = /\.glb$/i;
const BLEND_RE = /\.blend$/i; // бэкапы .blend1, .blend2… сюда не попадают

/** Порог awaitWriteFinish: Blender пишет файл не атомарно. */
const WRITE_FINISH_MS = 500;

interface ModelEntry {
  summary: ModelSummary;
  absPath: string;
  analysis: ModelAnalysis | null;
  /** Проверки по содержимому .glb: из анализа или те, что успели пройти до сбоя. */
  fileIssues: Issue[];
}

interface BlendInfo {
  name: string;
  mtime: number;
}

type LibraryEvents = { event: [ServerEvent]; ready: [] };

const toPosix = (p: string) => p.split(path.sep).join('/');
const posixDirname = (p: string) => {
  const i = p.lastIndexOf('/');
  return i < 0 ? '' : p.slice(0, i);
};
const posixBasename = (p: string) => p.slice(p.lastIndexOf('/') + 1);
const stem = (name: string) => name.replace(/\.[^.]+$/, '').toLowerCase();

async function sha1File(filePath: string): Promise<string> {
  const hash = createHash('sha1');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

/**
 * Каталог моделей: обход папки, наблюдение через chokidar и очередь анализа.
 * Ничего не пишет в папку моделей — только читает.
 */
export class ModelLibrary extends EventEmitter<LibraryEvents> {
  private modelsDir = '';
  private watcher: FSWatcher | null = null;
  private readonly models = new Map<string, ModelEntry>();
  /** Папка модели (POSIX, относительно modelsDir) → .blend в ней. */
  private readonly blends = new Map<string, Map<string, BlendInfo>>();
  private readonly cache: AnalysisCache;
  private readonly analyzer = new AnalyzerPool();

  private readonly pending = new Set<string>();
  private draining = false;
  /** Увеличивается при каждом перезапуске — задачи старой папки отбрасываются. */
  private generation = 0;
  private watcherReady = false;

  constructor(
    cacheDir: string,
    private readonly thumbs: ThumbStore,
  ) {
    super();
    this.cache = new AnalysisCache(cacheDir);
  }

  /** Хеши всех моделей — для чистки кешей. */
  liveHashes(): Set<string> {
    return new Set([...this.models.values()].map((m) => m.summary.hash));
  }

  /** Обновляет признак миниатюры у моделей с этим хешем и рассылает 'thumb'. Возвращает false, если таких нет. */
  thumbChanged(hash: string): boolean {
    let found = false;
    for (const entry of this.models.values()) {
      if (entry.summary.hash !== hash) continue;
      found = true;
      entry.summary = { ...entry.summary, hasThumb: this.thumbs.has(hash) };
      this.emit('event', { type: 'thumb', id: entry.summary.id, summary: entry.summary });
    }
    return found;
  }

  /** После удаления всех миниатюр. */
  thumbsCleared(): void {
    for (const entry of this.models.values()) entry.summary = { ...entry.summary, hasThumb: false };
    this.emit('event', { type: 'thumbs-reset' });
  }

  get dir(): string {
    return this.modelsDir;
  }

  /** true, пока идёт первичный обход или в очереди есть файлы. */
  get scanning(): boolean {
    return !this.watcherReady || this.pending.size > 0 || this.draining;
  }

  list(): ModelSummary[] {
    return [...this.models.values()].map((m) => m.summary);
  }

  has(id: string): boolean {
    return this.models.has(id);
  }

  absPath(id: string): string | null {
    return this.models.get(id)?.absPath ?? null;
  }

  analysis(id: string): ModelAnalysis | null {
    return this.models.get(id)?.analysis ?? null;
  }

  details(id: string): ModelDetails | null {
    const entry = this.models.get(id);
    if (!entry) return null;
    const { summary, analysis: a } = entry;
    return {
      ...summary,
      glbPath: entry.absPath,
      blendPath: summary.blendFile ? path.join(this.modelsDir, ...summary.modelDir.split('/'), summary.blendFile) : null,
      stats: a?.stats ?? null,
      textures: a?.textures ?? [],
      materials: a?.materials ?? [],
      objects: a?.objects ?? [],
      issues: this.issues(entry),
      bbox: a?.bbox ?? null,
      texelDensity: a?.texelDensity ?? null,
      extensionsUsed: a?.extensionsUsed ?? [],
      extensionsRequired: a?.extensionsRequired ?? [],
    };
  }

  /** Все проверки модели: по содержимому файла + по соседним файлам (E1, W11, I5). */
  private issues(entry: ModelEntry): Issue[] {
    return sortIssues([...entry.fileIssues, ...environmentIssues(entry.summary)]);
  }

  private updateIssueCounts(entry: ModelEntry): void {
    entry.summary.issueCounts = countIssues(this.issues(entry));
  }

  async start(modelsDir: string): Promise<void> {
    await this.stop();
    const gen = ++this.generation;
    this.modelsDir = modelsDir;
    this.watcherReady = false;
    void this.cache.pruneOldVersions();
    if (!(await isReadableDir(modelsDir))) {
      // Папки нет — каталог пуст, UI показывает заглушку с инструкцией.
      this.watcherReady = true;
      return;
    }

    const root = modelsDir;
    const watcher = chokidar.watch(root, {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: WRITE_FINISH_MS, pollInterval: 100 },
      ignored: (p, stats) => {
        const rel = path.relative(root, p);
        if (!rel) return false;
        // скрытые файлы и папки, включая .godot/
        if (rel.split(path.sep).some((seg) => seg.startsWith('.'))) return true;
        if (stats?.isFile()) return !(GLB_RE.test(p) || BLEND_RE.test(p));
        return false;
      },
    });
    this.watcher = watcher;

    watcher.on('add', (p, stats) => this.onFile('add', p, stats?.mtimeMs));
    watcher.on('change', (p, stats) => this.onFile('change', p, stats?.mtimeMs));
    watcher.on('unlink', (p) => this.onFile('unlink', p));
    watcher.on('unlinkDir', (p) => this.onUnlinkDir(p));
    watcher.on('error', (err) => console.error('[watch] ошибка:', err));
    watcher.on('ready', () => {
      if (gen !== this.generation) return;
      this.watcherReady = true;
      this.maybeEmitReady();
    });
  }

  async stop(): Promise<void> {
    this.generation++;
    this.pending.clear();
    this.models.clear();
    this.blends.clear();
    const w = this.watcher;
    this.watcher = null;
    if (w) await w.close();
  }

  async dispose(): Promise<void> {
    await this.stop();
    await this.analyzer.restart();
  }

  private relId(absPath: string): string {
    return toPosix(path.relative(this.modelsDir, absPath));
  }

  private onFile(kind: 'add' | 'change' | 'unlink', absPath: string, mtime?: number): void {
    const id = this.relId(absPath);
    if (GLB_RE.test(absPath)) {
      if (kind === 'unlink') this.removeModel(id);
      else this.enqueue(id);
    } else if (BLEND_RE.test(absPath)) {
      this.onBlend(kind, id, mtime);
    }
  }

  private onUnlinkDir(absPath: string): void {
    const prefix = this.relId(absPath) + '/';
    for (const id of [...this.models.keys()]) if (id.startsWith(prefix)) this.removeModel(id);
    for (const dir of [...this.blends.keys()]) if ((dir + '/').startsWith(prefix)) this.blends.delete(dir);
  }

  // ---------- .blend ----------

  private onBlend(kind: 'add' | 'change' | 'unlink', relPath: string, mtime?: number): void {
    const dir = posixDirname(relPath);
    const name = posixBasename(relPath);
    let inDir = this.blends.get(dir);
    if (kind === 'unlink') {
      inDir?.delete(name);
      if (inDir?.size === 0) this.blends.delete(dir);
    } else {
      if (!inDir) this.blends.set(dir, (inDir = new Map()));
      inDir.set(name, { name, mtime: mtime ?? Date.now() });
    }
    this.relinkDir(dir);
  }

  /**
   * Исходник модели: .blend с тем же именем, что у .glb; иначе — единственный .blend,
   * но только если и .glb в папке один. В «плоской» папке с несколькими .glb
   * ищем исключительно по совпадению имени.
   */
  private resolveBlend(dir: string, fileName: string): BlendInfo | null {
    const inDir = this.blends.get(dir);
    if (!inDir || inDir.size === 0) return null;
    const s = stem(fileName);
    for (const b of inDir.values()) if (stem(b.name) === s) return b;
    if (inDir.size === 1 && this.glbCountInDir(dir) === 1) return inDir.values().next().value!;
    return null;
  }

  private glbCountInDir(dir: string): number {
    let n = 0;
    for (const m of this.models.values()) if (m.summary.modelDir === dir) n++;
    return n;
  }

  /** Пересчитывает привязку .blend у моделей папки и рассылает `changed`, если что-то изменилось. */
  private relinkDir(dir: string): void {
    for (const entry of this.models.values()) {
      const s = entry.summary;
      if (s.modelDir !== dir) continue;
      const blend = this.resolveBlend(dir, s.fileName);
      const blendFile = blend?.name ?? null;
      const blendMtime = blend?.mtime ?? null;
      if (blendFile === s.blendFile && blendMtime === s.blendMtime) continue;
      entry.summary = { ...s, blendFile, blendMtime };
      // Пересчитываются только W11 и I5 — без повторного анализа.
      this.updateIssueCounts(entry);
      this.emit('event', { type: 'changed', id: s.id, summary: entry.summary });
    }
  }

  // ---------- .glb ----------

  private removeModel(id: string): void {
    this.pending.delete(id);
    const entry = this.models.get(id);
    if (!entry) return;
    this.models.delete(id);
    this.emit('event', { type: 'removed', id });
    this.relinkDir(entry.summary.modelDir);
  }

  private enqueue(id: string): void {
    this.pending.add(id);
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.pending.size > 0) {
        const id = this.pending.values().next().value!;
        this.pending.delete(id);
        const gen = this.generation;
        try {
          await this.processGlb(id, gen);
        } catch (err) {
          console.error(`[scan] ${id}:`, err);
        }
      }
    } finally {
      this.draining = false;
    }
    this.maybeEmitReady();
  }

  private maybeEmitReady(): void {
    if (!this.scanning) this.emit('ready');
  }

  private async processGlb(id: string, gen: number): Promise<void> {
    const absPath = path.join(this.modelsDir, ...id.split('/'));
    let stat;
    let hash;
    try {
      stat = await fs.stat(absPath);
      hash = await sha1File(absPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return; // удалён — придёт unlink
      throw err;
    }
    if (gen !== this.generation) return;

    const prev = this.models.get(id);
    let analysis: ModelAnalysis | null = null;
    let analysisError: string | undefined;
    let failureIssues: Issue[] = [];
    if (prev && prev.summary.hash === hash) {
      // Содержимое не изменилось (например, touch) — обновляем только даты.
      analysis = prev.analysis;
      analysisError = prev.summary.analysisError;
      failureIssues = prev.analysis ? [] : prev.fileIssues;
    } else {
      analysis = await this.cache.get(hash);
      if (!analysis) {
        const t0 = performance.now();
        try {
          analysis = await this.analyzer.analyze(absPath);
          await this.cache.set(hash, analysis);
          console.log(`[scan] проанализирован ${id} за ${Math.round(performance.now() - t0)} мс`);
        } catch (err) {
          analysisError = (err as Error).message || String(err);
          if (err instanceof AnalyzeError) failureIssues = err.issues;
          console.warn(`[scan] ${id}: ${analysisError}`);
        }
      }
    }
    if (gen !== this.generation) return;

    const modelDir = posixDirname(id);
    const fileName = posixBasename(id);
    const isNew = !prev;
    const entry: ModelEntry = {
      summary: this.buildSummary({ id, modelDir, fileName, stat, hash, analysis, analysisError }),
      absPath,
      analysis,
      fileIssues: analysis?.issues ?? failureIssues,
    };
    // .blend резолвим после вставки: правило «единственный .blend» зависит от числа .glb в папке.
    this.models.set(id, entry);
    const blend = this.resolveBlend(modelDir, fileName);
    entry.summary.blendFile = blend?.name ?? null;
    entry.summary.blendMtime = blend?.mtime ?? null;
    this.updateIssueCounts(entry);
    const { summary } = entry;

    if (isNew) {
      this.emit('event', { type: 'added', id, summary });
      // Новый .glb мог изменить привязку .blend у соседей (плоская папка).
      this.relinkDir(modelDir);
    } else {
      this.emit('event', { type: 'changed', id, summary });
    }
  }

  private buildSummary(a: {
    id: string;
    modelDir: string;
    fileName: string;
    stat: { size: number; mtimeMs: number };
    hash: string;
    analysis: ModelAnalysis | null;
    analysisError?: string;
  }): ModelSummary {
    const meta = a.analysis?.meta;
    return {
      id: a.id,
      modelDir: a.modelDir,
      fileName: a.fileName,
      blendFile: null,
      blendMtime: null,
      title: meta?.title ?? titleFromFileName(a.fileName),
      tags: meta?.tags ?? [],
      ...(meta?.description ? { description: meta.description } : {}),
      fileSize: a.stat.size,
      mtime: a.stat.mtimeMs,
      hash: a.hash,
      triangles: a.analysis?.stats.triangles ?? null,
      vertices: a.analysis?.stats.vertices ?? null,
      maxTextureSize: a.analysis?.stats.textures.count
        ? Math.max(a.analysis.stats.textures.maxWidth, a.analysis.stats.textures.maxHeight)
        : null,
      issueCounts: { error: 0, warning: 0, info: 0 }, // считаются после привязки .blend
      hasThumb: this.thumbs.has(a.hash),
      ...(a.analysisError ? { analysisError: a.analysisError } : {}),
    };
  }
}
