import type { ModelSummary } from '../../../../shared/types.ts';

export type SortKey = 'title' | 'mtime' | 'triangles' | 'size';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'По названию' },
  { key: 'mtime', label: 'По дате изменения' },
  { key: 'triangles', label: 'По треугольникам' },
  { key: 'size', label: 'По размеру файла' },
];

export interface Filters {
  q: string;
  tags: string[];
  sort: SortKey;
}

// ---------- URL ----------

export function parseFilters(params: URLSearchParams): Filters {
  const sort = params.get('sort') as SortKey | null;
  return {
    q: params.get('q') ?? '',
    tags: (params.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    sort: sort && SORT_OPTIONS.some((o) => o.key === sort) ? sort : 'title',
  };
}

export function serializeFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.tags.length) p.set('tags', f.tags.join(','));
  if (f.sort !== 'title') p.set('sort', f.sort);
  return p;
}

export const hasActiveFilters = (f: Filters) => Boolean(f.q || f.tags.length);

// ---------- предикаты ----------

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

function matchesSearch(m: ModelSummary, q: string): boolean {
  if (!q) return true;
  const needle = norm(q.trim());
  return norm(m.title).includes(needle) || norm(m.fileName).includes(needle);
}

/** Любой из выбранных тегов (ИЛИ). */
function matchesTags(m: ModelSummary, tags: string[]): boolean {
  return tags.length === 0 || tags.some((t) => m.tags.includes(t));
}

// ---------- сортировка ----------

const collator = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' });
const byTitle = (a: ModelSummary, b: ModelSummary) => collator.compare(a.title, b.title) || collator.compare(a.id, b.id);

/** Числовые — по убыванию; неизвестные значения (ещё не проанализировано) — в конце. */
function byNumber(get: (m: ModelSummary) => number | null) {
  return (a: ModelSummary, b: ModelSummary) => {
    const va = get(a);
    const vb = get(b);
    if (va === vb) return byTitle(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  };
}

const COMPARATORS: Record<SortKey, (a: ModelSummary, b: ModelSummary) => number> = {
  title: byTitle,
  mtime: byNumber((m) => m.mtime),
  triangles: byNumber((m) => m.triangles),
  size: byNumber((m) => m.fileSize),
};

// ---------- результат + фасеты ----------

export interface CatalogView {
  items: ModelSummary[];
  /** Счётчики тегов учитывают поиск. */
  tags: { tag: string; count: number }[];
}

export function buildView(models: ModelSummary[], f: Filters): CatalogView {
  const bySearch = models.filter((m) => matchesSearch(m, f.q));

  // Теги: учитываем поиск, но не сами теги.
  // Порядок чипов — по общему числу моделей, чтобы чипы не прыгали при выборе.
  const totals = new Map<string, number>();
  for (const m of models) for (const t of m.tags) totals.set(t, (totals.get(t) ?? 0) + 1);
  const tagCounts = new Map<string, number>();
  for (const m of bySearch) for (const t of m.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const tags = [...totals]
    .sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))
    .map(([tag]) => ({ tag, count: tagCounts.get(tag) ?? 0 }));

  const items = bySearch.filter((m) => matchesTags(m, f.tags)).sort(COMPARATORS[f.sort]);

  return { items, tags };
}
