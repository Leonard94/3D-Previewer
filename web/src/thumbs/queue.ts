// Очередь миниатюр на странице каталога: по одной модели, видимые карточки — первыми.
import { create } from 'zustand';
import type { ModelSummary } from '../../../shared/types.ts';
import { api, modelFileUrl } from '../api/client.ts';
import { useCatalog } from '../store/catalog.ts';
import { ContextLostError, ThumbRenderer } from './ThumbRenderer.ts';

interface ThumbsState {
  /** hash → причина: эти модели в этой вкладке больше не пробуем. */
  failed: Record<string, string>;
  /** id модели, которая рендерится сейчас. */
  active: string | null;
}

export const useThumbs = create<ThumbsState>(() => ({ failed: {}, active: null }));

/** Пауза между моделями — чтобы страница оставалась отзывчивой. */
const PAUSE_MS = 30;
/** Сколько раз пробовать модель, на которой теряется WebGL-контекст. */
const MAX_CONTEXT_LOSSES = 2;

// ---------- видимость карточек ----------

const visible = new Set<string>();
const observed = new Map<Element, string>();
let observer: IntersectionObserver | null = null;

function getObserver(): IntersectionObserver {
  observer ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const id = observed.get(e.target);
        if (!id) continue;
        if (e.isIntersecting) visible.add(id);
        else visible.delete(id);
      }
      kick();
    },
    { rootMargin: '200px 0px' },
  );
  return observer;
}

/** Карточка без миниатюры сообщает, видна ли она. Возвращает отписку. */
export function observeCard(el: Element, id: string): () => void {
  observed.set(el, id);
  getObserver().observe(el);
  return () => {
    observer?.unobserve(el);
    observed.delete(el);
    visible.delete(id);
  };
}

// ---------- очередь ----------

let renderer: ThumbRenderer | null = null;
let running = false;
let active = false;
const contextLosses = new Map<string, number>();

function needsThumb(m: ModelSummary, failed: Record<string, string>): boolean {
  return !m.hasThumb && !m.analysisError && m.triangles !== null && !failed[m.hash];
}

function pickNext(): ModelSummary | null {
  const { models } = useCatalog.getState();
  const { failed } = useThumbs.getState();
  for (const id of visible) {
    const m = models[id];
    if (m && needsThumb(m, failed)) return m;
  }
  let next: ModelSummary | null = null;
  for (const m of Object.values(models)) {
    if (needsThumb(m, failed) && (!next || m.title.localeCompare(next.title, 'ru') < 0)) next = m;
  }
  return next;
}

function fail(hash: string, reason: string) {
  useThumbs.setState((s) => ({ failed: { ...s.failed, [hash]: reason } }));
}

function kick() {
  if (active && !running) void run();
}

async function run(): Promise<void> {
  running = true;
  try {
    for (let m = pickNext(); m && active; m = pickNext()) {
      useThumbs.setState({ active: m.id });
      try {
        renderer ??= new ThumbRenderer();
        const blob = await renderer.render(modelFileUrl(m.id, m.hash));
        if (!active) break;
        await api.putThumb(m.hash, blob);
        useCatalog.getState().setHasThumb(m.hash, true);
      } catch (err) {
        if (err instanceof ContextLostError || renderer?.contextLost) {
          // Контекст потерян: пересоздаём рендерер и пробуем ещё раз.
          renderer?.dispose();
          renderer = null;
          const losses = (contextLosses.get(m.hash) ?? 0) + 1;
          contextLosses.set(m.hash, losses);
          if (losses >= MAX_CONTEXT_LOSSES) fail(m.hash, 'видеокарта сбрасывает контекст на этой модели');
        } else {
          console.warn(`[thumbs] ${m.id}:`, err);
          fail(m.hash, (err as Error)?.message || String(err));
        }
      }
      await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
  } finally {
    running = false;
    useThumbs.setState({ active: null });
  }
  // Пока рендерили, могли появиться новые модели.
  if (active && pickNext()) void run();
}

/** Запускает очередь на странице каталога. Возвращает остановку (уход со страницы). */
export function startThumbs(): () => void {
  active = true;
  const unsubscribe = useCatalog.subscribe((s, prev) => {
    if (s.thumbsReset !== prev.thumbsReset) resetThumbFailures();
    if (s.models !== prev.models) kick();
  });
  kick();
  return () => {
    active = false;
    unsubscribe();
    // Рендерер освобождается, когда текущая модель дорендерится.
    const stopWhenIdle = () => {
      if (running) return void setTimeout(stopWhenIdle, 100);
      if (!active) {
        renderer?.dispose();
        renderer = null;
      }
    };
    stopWhenIdle();
  };
}

/** После «Перегенерировать все»: забыть неудачи — попробуем заново. */
function resetThumbFailures(): void {
  contextLosses.clear();
  useThumbs.setState({ failed: {} });
}
