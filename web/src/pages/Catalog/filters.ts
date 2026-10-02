import type { ModelSummary } from '../../../../shared/types.ts';

export type SortKey = 'title' | 'mtime' | 'triangles' | 'size';

export const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'title', label: 'По названию' },
  { key: 'mtime', label: 'По дате изменения' },
  { key: 'triangles', label: 'По треугольникам' },
  { key: 'size', label: 'По размеру файла' },
];

/** Особое значение категории: модели без категории. */
export const NO_CATEGORY = '-';

export interface Filters {
  q: string;
  /** '' — все; NO_CATEGORY — без категории; иначе путь категории (с подкатегориями). */
  cat: string;
  tags: string[];
  sort: SortKey;
}

// ---------- URL ----------

export function parseFilters(params: URLSearchParams): Filters {
  const sort = params.get('sort') as SortKey | null;
  return {
    q: params.get('q') ?? '',
    cat: params.get('cat') ?? '',
    tags: (params.get('tags') ?? '').split(',').map((t) => t.trim()).filter(Boolean),
    sort: sort && SORT_OPTIONS.some((o) => o.key === sort) ? sort : 'title',
  };
}

export function serializeFilters(f: Filters): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.cat) p.set('cat', f.cat);
  if (f.tags.length) p.set('tags', f.tags.join(','));
  if (f.sort !== 'title') p.set('sort', f.sort);
  return p;
}

export const hasActiveFilters = (f: Filters) => Boolean(f.q || f.cat || f.tags.length);

// ---------- предикаты ----------

const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

function matchesSearch(m: ModelSummary, q: string): boolean {
  if (!q) return true;
  const needle = norm(q.trim());
  return norm(m.title).includes(needle) || norm(m.fileName).includes(needle);
}

function matchesCategory(m: ModelSummary, cat: string): boolean {
  if (!cat) return true;
  if (cat === NO_CATEGORY) return m.category === '';
  return m.category === cat || m.category.startsWith(cat + '/');
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

export interface CategoryNode {
  path: string;
  name: string;
  depth: number;
  count: number;
}

export interface CatalogView {
  items: ModelSummary[];
  /** Дерево категорий в порядке обхода; счётчики учитывают поиск и теги. */
  categories: CategoryNode[];
  uncategorizedCount: number;
  allCount: number;
  /** Счётчики тегов учитывают поиск и категорию. */
  tags: { tag: string; count: number }[];
}

export function buildView(models: ModelSummary[], f: Filters): CatalogView {
  const bySearch = models.filter((m) => matchesSearch(m, f.q));

  // Категории: учитываем поиск и теги, но не саму категорию.
  const forCats = bySearch.filter((m) => matchesTags(m, f.tags));
  const counts = new Map<string, number>();
  const allPaths = new Set<string>();
  for (const m of models) {
    const segs = m.category ? m.category.split('/') : [];
    for (let i = 1; i <= segs.length; i++) allPaths.add(segs.slice(0, i).join('/'));
  }
  for (const m of forCats) {
    const segs = m.category ? m.category.split('/') : [];
    for (let i = 1; i <= segs.length; i++) {
      const p = segs.slice(0, i).join('/');
      counts.set(p, (counts.get(p) ?? 0) + 1);
    }
  }
  const categories = [...allPaths]
    .sort((a, b) => {
      // обход дерева: родитель перед детьми, соседи по алфавиту
      const sa = a.split('/');
      const sb = b.split('/');
      for (let i = 0; i < Math.min(sa.length, sb.length); i++) {
        const c = collator.compare(sa[i]!, sb[i]!);
        if (c) return c;
      }
      return sa.length - sb.length;
    })
    .map((path) => {
      const segs = path.split('/');
      return { path, name: segs[segs.length - 1]!, depth: segs.length - 1, count: counts.get(path) ?? 0 };
    });

  // Теги: учитываем поиск и категорию, но не сами теги.
  const forTags = bySearch.filter((m) => matchesCategory(m, f.cat));
  // Порядок чипов — по общему числу моделей, чтобы чипы не прыгали при выборе.
  const totals = new Map<string, number>();
  for (const m of models) for (const t of m.tags) totals.set(t, (totals.get(t) ?? 0) + 1);
  const tagCounts = new Map<string, number>();
  for (const m of forTags) for (const t of m.tags) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
  const tags = [...totals]
    .sort((a, b) => b[1] - a[1] || collator.compare(a[0], b[0]))
    .map(([tag]) => ({ tag, count: tagCounts.get(tag) ?? 0 }));

  const items = forCats.filter((m) => matchesCategory(m, f.cat)).sort(COMPARATORS[f.sort]);

  return {
    items,
    categories,
    uncategorizedCount: forCats.filter((m) => m.category === '').length,
    allCount: forCats.length,
    tags,
  };
}
