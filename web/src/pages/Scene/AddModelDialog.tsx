import { useMemo, useState, type MouseEvent } from 'react';
import type { ModelSummary } from '../../../../shared/types.ts';
import { thumbUrl } from '../../api/client.ts';
import { Modal } from '../../components/Modal.tsx';
import { formatInt } from '../../format.ts';
import { useCatalog } from '../../store/catalog.ts';
import { useScene } from '../../store/scene.ts';

function matches(m: ModelSummary, q: string): boolean {
  if (!q) return true;
  return [m.title, m.category, m.id, ...m.tags].some((s) => s.toLowerCase().includes(q));
}

/** Выбор модели из каталога. Клик — добавить и закрыть, Shift+клик — добавить и выбрать ещё. */
export function AddModelDialog({ onClose }: { onClose: () => void }) {
  const models = useCatalog((s) => s.models);
  const loaded = useCatalog((s) => s.loaded);
  const thumbsReset = useCatalog((s) => s.thumbsReset);
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<Record<string, number>>({});

  const sorted = useMemo(() => Object.values(models).sort((a, b) => a.title.localeCompare(b.title, 'ru')), [models]);
  const q = query.trim().toLowerCase();
  const list = useMemo(() => sorted.filter((m) => matches(m, q)), [sorted, q]);

  const add = (m: ModelSummary, keepOpen: boolean) => {
    useScene.getState().add(m.id);
    if (!keepOpen) return onClose();
    setAdded((a) => ({ ...a, [m.id]: (a[m.id] ?? 0) + 1 }));
  };

  return (
    <Modal title="Добавить модель" onClose={onClose} wide>
      <div className="add-model">
        <div className="add-model__tools">
          <input
            className="input add-model__search"
            placeholder="Название, категория или тег"
            value={query}
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              const first = list.find((m) => !m.analysisError);
              if (e.key === 'Enter' && first) add(first, e.shiftKey);
            }}
          />
          <span className="muted add-model__note">Shift+клик — добавить и выбрать ещё</span>
        </div>
        {list.length > 0 ? (
          <ul className="add-model__grid">
            {list.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="add-model__item"
                  disabled={Boolean(m.analysisError)}
                  onClick={(e: MouseEvent) => add(m, e.shiftKey)}
                  title={m.id}
                >
                  <span className="add-model__thumb">
                    {m.hasThumb && !m.analysisError && <img src={thumbUrl(m.hash, thumbsReset)} alt="" decoding="async" loading="lazy" />}
                    {added[m.id] && <span className="add-model__added num">+{added[m.id]}</span>}
                  </span>
                  <span className="add-model__name">{m.title}</span>
                  <span className="add-model__sub muted">
                    {m.analysisError ? 'Файл не читается' : [m.category, m.triangles !== null && `${formatInt(m.triangles)} треуг.`].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted add-model__nothing">{loaded ? 'Ничего не найдено.' : 'Загрузка каталога…'}</p>
        )}
      </div>
    </Modal>
  );
}
