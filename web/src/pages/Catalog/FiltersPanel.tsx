import { useEffect, useRef } from 'react';
import { SORT_OPTIONS, hasActiveFilters, type CatalogView, type Filters, type SortKey } from './filters.ts';

interface Props {
  filters: Filters;
  view: CatalogView;
  onChange: (patch: Partial<Filters>, opts?: { replace?: boolean }) => void;
  onReset: () => void;
}

export function FiltersPanel({ filters, view, onChange, onReset }: Props) {
  const searchRef = useRef<HTMLInputElement>(null);

  // «/» — фокус в поиск, Esc — очистить поиск.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const toggleTag = (tag: string) => {
    const tags = filters.tags.includes(tag) ? filters.tags.filter((t) => t !== tag) : [...filters.tags, tag];
    onChange({ tags });
  };

  return (
    <aside className="filters">
      <div className="filters__search">
        <input
          ref={searchRef}
          className="input"
          type="search"
          placeholder="Название или файл"
          aria-label="Поиск по названию и имени файла"
          value={filters.q}
          onChange={(e) => onChange({ q: e.target.value }, { replace: true })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onChange({ q: '' }, { replace: true });
              e.currentTarget.blur();
            }
          }}
          spellCheck={false}
        />
        <kbd className="filters__kbd">/</kbd>
      </div>

      <div className="filters__group">
        <div className="section-title">Сортировка</div>
        <select
          className="input filters__select"
          value={filters.sort}
          onChange={(e) => onChange({ sort: e.target.value as SortKey })}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {view.tags.length > 0 && (
        <div className="filters__group">
          <div className="section-title">Теги</div>
          <div className="chips">
            {view.tags.map(({ tag, count }) => {
              const active = filters.tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className={`chip${active ? ' active' : ''}${count === 0 && !active ? ' empty' : ''}`}
                  onClick={() => toggleTag(tag)}
                  aria-pressed={active}
                >
                  {tag} <span className="chip__count num">{count}</span>
                </button>
              );
            })}
          </div>
          {filters.tags.length > 1 && <div className="filters__hint muted">Показаны модели с любым из выбранных тегов</div>}
        </div>
      )}

      {hasActiveFilters(filters) && (
        <button type="button" className="btn filters__reset" onClick={onReset}>
          Сбросить фильтры
        </button>
      )}
    </aside>
  );
}
