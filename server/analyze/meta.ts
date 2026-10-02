import type { ModelMeta } from '../../shared/types.ts';
import type { GltfJson } from './glb.ts';

type Extras = Record<string, unknown>;

function asExtras(v: unknown): Extras | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Extras) : null;
}

function str(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s : null;
}

export function parseTags(v: unknown): string[] {
  const parts = Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : [];
  const tags = parts
    .flatMap((p) => p.split(/[,;]/))
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set(tags)];
}

const META_KEYS = ['title', 'tags', 'description', 'placement'];

/** Метаданные: extras сцены → extras единственного корневого узла → нет. */
export function readMeta(json: GltfJson): ModelMeta {
  const scene = json.scenes?.[json.scene ?? 0];
  const candidates: (Extras | null)[] = [asExtras(scene?.extras)];
  const roots = scene?.nodes ?? [];
  if (roots.length === 1) candidates.push(asExtras(json.nodes?.[roots[0]!]?.extras));

  const extras = candidates.find((e) => e && META_KEYS.some((k) => k in e)) ?? null;
  return {
    title: str(extras?.title),
    tags: parseTags(extras?.tags),
    description: str(extras?.description),
    placement: str(extras?.placement)?.toLowerCase() ?? null,
  };
}

/** Название по имени файла: без расширения, `_` и `-` → пробелы. */
export function titleFromFileName(fileName: string): string {
  return fileName.replace(/\.glb$/i, '').replace(/[_-]+/g, ' ').trim();
}
