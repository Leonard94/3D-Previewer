import { useCallback, useEffect, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { AppHeader } from '../../components/AppHeader.tsx';
import { formatInt, plural } from '../../format.ts';
import { startCatalogSync, useCatalog } from '../../store/catalog.ts';
import { startThumbs } from '../../thumbs/queue.ts';
import { FiltersPanel } from './FiltersPanel.tsx';
import { ModelCard } from './ModelCard.tsx';
import { buildView, parseFilters, serializeFilters, type Filters } from './filters.ts';
import './CatalogPage.css';

const FLASH_MS = 3000;

export function CatalogPage() {
  useEffect(() => {
    startCatalogSync();
    document.title = '3D Previewer';
  }, []);
  // Миниатюры рендерятся только на странице каталога; при уходе рендерер освобождается.
  useEffect(() => startThumbs(), []);

  const config = useCatalog((s) => s.config);
  const modelsById = useCatalog((s) => s.models);
  const loaded = useCatalog((s) => s.loaded);
  const error = useCatalog((s) => s.error);
  const touched = useCatalog((s) => s.touched);

  // Состояние фильтров живёт в query-параметрах URL.
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseFilters(params), [params]);
  const updateFilters = useCallback(
    (patch: Partial<Filters>, opts?: { replace?: boolean }) =>
      setParams((prev) => serializeFilters({ ...parseFilters(prev), ...patch }), { replace: opts?.replace }),
    [setParams],
  );
  const resetFilters = useCallback(() => updateFilters({ q: '', cat: '', tags: [] }), [updateFilters]);

  const models = useMemo(() => Object.values(modelsById), [modelsById]);
  const view = useMemo(() => buildView(models, filters), [models, filters]);

  const categoryCount = useMemo(() => new Set(models.map((m) => m.category).filter(Boolean)).size, [models]);
  const tagCount = useMemo(() => new Set(models.flatMap((m) => m.tags)).size, [models]);

  const now = Date.now();
  const dirMissing = config !== null && !config.modelsDirExists;
  const empty = loaded && !dirMissing && models.length === 0 && !error;

  return (
    <div className="catalog">
      <AppHeader>
        <span className="muted num">
          {formatInt(models.length)} {plural(models.length, ['модель', 'модели', 'моделей'])} · {categoryCount}{' '}
          {plural(categoryCount, ['категория', 'категории', 'категорий'])} · {tagCount}{' '}
          {plural(tagCount, ['тег', 'тега', 'тегов'])}
        </span>
      </AppHeader>

      {error && <div className="catalog__notice">Сервер недоступен: {error}</div>}

      {dirMissing && (
        <div className="catalog__empty">
          <div className="section-title">Папка моделей не найдена</div>
          <p className="mono">{config.modelsDir}</p>
          <p className="muted">
            Укажите папку моделей Godot-проекта (обычно <span className="mono">assets/models</span>) в настройках или
            запустите с аргументом <span className="mono">--models-dir &lt;путь&gt;</span>.
          </p>
          <Link to="/settings" className="btn primary">
            Открыть настройки
          </Link>
        </div>
      )}

      {empty && (
        <div className="catalog__empty">
          <div className="section-title">Моделей пока нет</div>
          <p className="mono">{config?.modelsDir}</p>
          <p className="muted">Положите папку модели с .glb сюда — она появится автоматически.</p>
        </div>
      )}

      {models.length > 0 && (
        <div className="catalog__layout">
          <FiltersPanel filters={filters} view={view} onChange={updateFilters} onReset={resetFilters} />

          <main className="catalog__main">
            {view.items.length > 0 ? (
              <div className="grid">
                {view.items.map((m, i) => {
                  const t = touched[m.id];
                  return <ModelCard key={m.id} model={m} index={i} flashKey={t && now - t < FLASH_MS ? t : undefined} />;
                })}
              </div>
            ) : (
              <div className="catalog__nothing">
                <p className="muted">По выбранным фильтрам ничего не найдено.</p>
                <button type="button" className="btn primary" onClick={resetFilters}>
                  Сбросить фильтры
                </button>
              </div>
            )}
          </main>
        </div>
      )}
    </div>
  );
}
