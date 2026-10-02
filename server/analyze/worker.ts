// Рабочий поток анализа: тяжёлый парсинг .glb не блокирует HTTP-сервер.
import { parentPort } from 'node:worker_threads';
import type { Issue } from '../../shared/types.ts';
import { AnalysisFailure, analyzeGlb } from './index.ts';

export interface WorkerRequest {
  id: number;
  filePath: string;
}

export type WorkerResponse =
  | { id: number; ok: true; result: Awaited<ReturnType<typeof analyzeGlb>> }
  | { id: number; ok: false; error: string; issues: Issue[] };

parentPort!.on('message', async ({ id, filePath }: WorkerRequest) => {
  let response: WorkerResponse;
  try {
    response = { id, ok: true, result: await analyzeGlb(filePath) };
  } catch (err) {
    response = {
      id,
      ok: false,
      error: (err as Error)?.message || String(err),
      issues: err instanceof AnalysisFailure ? err.issues : [],
    };
  }
  parentPort!.postMessage(response);
});
