// Проверки модели (раздел 6 ТЗ). Содержимое .glb проверяется при анализе и кешируется вместе с ним;
// проверки, зависящие от соседних файлов (E1, W11, I5), считаются в сканере без повторного анализа.
import type { Issue, IssueLevel, ModelSummary } from '../../shared/types.ts';
import { formatAge } from './format.ts';

export { checkFile } from './file.ts';
export { checkModel } from './model.ts';

/** W11: исходник считается новее экспорта, если сохранён позже .glb больше чем на столько. */
export const STALE_EXPORT_MS = 2 * 60_000;

/** Проверки по соседним файлам: ошибка чтения, устаревший экспорт, нет .blend. */
export function environmentIssues(s: Pick<ModelSummary, 'analysisError' | 'blendFile' | 'blendMtime' | 'mtime'>): Issue[] {
  const issues: Issue[] = [];
  if (s.analysisError) {
    issues.push({
      code: 'E1',
      level: 'error',
      message: `Файл не читается: ${s.analysisError}`,
      hint: 'Переэкспортировать модель из Blender (File → Export → glTF 2.0, формат .glb)',
    });
  }
  if (s.blendFile && s.blendMtime !== null && s.blendMtime - s.mtime > STALE_EXPORT_MS) {
    issues.push({
      code: 'W11',
      level: 'warning',
      message: `Исходник новее экспорта на ${formatAge(s.blendMtime - s.mtime)}`,
      hint: 'Если менял модель — переэкспортируй .glb. Предупреждение пропадёт само',
      details: [s.blendFile],
    });
  }
  if (!s.blendFile) {
    issues.push({
      code: 'I5',
      level: 'info',
      message: 'В папке модели нет исходника .blend',
      hint: 'Положить .blend рядом с .glb, с тем же именем',
    });
  }
  return issues;
}

const LEVEL_ORDER: Record<IssueLevel, number> = { error: 0, warning: 1, info: 2 };

/** Ошибки → предупреждения → инфо, внутри уровня — по номеру кода. */
export function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || Number(a.code.slice(1)) - Number(b.code.slice(1)),
  );
}

export function countIssues(issues: Issue[]): Record<IssueLevel, number> {
  const counts: Record<IssueLevel, number> = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.level]++;
  return counts;
}
