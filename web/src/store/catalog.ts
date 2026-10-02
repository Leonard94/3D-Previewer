import { create } from 'zustand';
import type { ConfigResponse, ModelSummary, ServerEvent } from '../../../shared/types.ts';
import { api } from '../api/client.ts';
import { subscribeConnection, subscribeEvents } from '../api/events.ts';

interface CatalogState {
  config: ConfigResponse | null;
  models: Record<string, ModelSummary>;
  loaded: boolean;
  error: string | null;
  connected: boolean;
  /** id → время последнего обновления по WebSocket (для подсветки). */
  touched: Record<string, number>;
  /** Растёт при «Перегенерировать все миниатюры» — очередь забывает прежние неудачи. */
  thumbsReset: number;
  reload: () => Promise<void>;
  applyEvent: (e: ServerEvent) => void;
  /** Миниатюра готова (или удалена) — без подсветки карточки как изменённой. */
  setHasThumb: (hash: string, hasThumb: boolean) => void;
}

export const useCatalog = create<CatalogState>((set, get) => ({
  config: null,
  models: {},
  loaded: false,
  error: null,
  connected: false,
  touched: {},
  thumbsReset: 0,

  reload: async () => {
    try {
      const [config, list] = await Promise.all([api.getConfig(), api.listModels()]);
      set({ config, models: Object.fromEntries(list.map((m) => [m.id, m])), loaded: true, error: null });
    } catch (err) {
      set({ error: (err as Error).message, loaded: true });
    }
  },

  applyEvent: (e) => {
    if (e.type === 'config-changed') {
      void get().reload();
      return;
    }
    if (e.type === 'thumbs-reset') {
      const models = Object.fromEntries(Object.entries(get().models).map(([id, m]) => [id, { ...m, hasThumb: false }]));
      set({ models, thumbsReset: get().thumbsReset + 1 });
      return;
    }
    if (!e.id) return;
    if (e.type === 'thumb') {
      if (e.summary && get().models[e.id]) set({ models: { ...get().models, [e.id]: e.summary } });
      return;
    }
    const models = { ...get().models };
    if (e.type === 'removed') delete models[e.id];
    else if (e.summary) models[e.id] = e.summary;
    set({ models, touched: { ...get().touched, [e.id]: Date.now() } });
  },

  setHasThumb: (hash, hasThumb) => {
    const current = get().models;
    let models: Record<string, ModelSummary> | null = null;
    for (const [id, m] of Object.entries(current)) {
      if (m.hash !== hash || m.hasThumb === hasThumb) continue;
      models ??= { ...current };
      models[id] = { ...m, hasThumb };
    }
    if (models) set({ models });
  },
}));

let started = false;

/** Подключает стор к серверу: первая загрузка + живые обновления. Вызывается один раз. */
export function startCatalogSync(): void {
  if (started) return;
  started = true;
  subscribeEvents((e) => useCatalog.getState().applyEvent(e));
  let wasConnected = false;
  subscribeConnection((connected) => {
    useCatalog.setState({ connected });
    // При (пере)подключении — полная перезагрузка: события за время разрыва потеряны.
    if (connected && !wasConnected) void useCatalog.getState().reload();
    wasConnected = connected;
  });
  void useCatalog.getState().reload();
}
