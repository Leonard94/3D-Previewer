import { Worker } from 'node:worker_threads';
import type { Issue } from '../../shared/types.ts';
import type { ModelAnalysis } from './index.ts';
import type { WorkerRequest, WorkerResponse } from './worker.ts';

/** Ошибка анализа; issues — проверки, которые успели пройти до сбоя. */
export class AnalyzeError extends Error {
  constructor(
    message: string,
    readonly issues: Issue[] = [],
  ) {
    super(message);
  }
}

/** Если файл анализируется дольше — поток перезапускается, файл получает ошибку. */
const TIMEOUT_MS = 120_000;

interface Pending {
  resolve: (a: ModelAnalysis) => void;
  reject: (e: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Один рабочий поток анализа. Очередь последовательная (её держит сканер),
 * упавший или зависший поток пересоздаётся.
 */
export class AnalyzerPool {
  private worker: Worker | null = null;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    // JS-вход регистрирует tsx внутри потока — иначе worker.ts не загрузится.
    const worker = new Worker(new URL('./worker-entry.mjs', import.meta.url));
    worker.on('message', (msg: WorkerResponse) => {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new AnalyzeError(msg.error, msg.issues));
    });
    const fail = (err: Error) => {
      if (this.worker === worker) this.worker = null;
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(err);
        this.pending.delete(id);
      }
    };
    worker.on('error', (err) => fail(new Error(`анализатор упал: ${err.message}`)));
    worker.on('exit', (code) => fail(new Error(`анализатор завершился (код ${code})`)));
    worker.unref();
    this.worker = worker;
    return worker;
  }

  analyze(filePath: string): Promise<ModelAnalysis> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('анализ занял слишком много времени'));
        void this.restart();
      }, TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, filePath } satisfies WorkerRequest);
    });
  }

  async restart(): Promise<void> {
    const w = this.worker;
    this.worker = null;
    if (w) await w.terminate();
  }
}
