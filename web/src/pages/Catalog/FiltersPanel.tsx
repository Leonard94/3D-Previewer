import { useEffect, useRef } from 'react';
import { formatInt } from '../../format.ts';
import { NO_CATEGORY, SORT_OPTIONS, hasActiveFilters, type CatalogView, type Filters, type SortKey } from './filters.ts';

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

  const showTree = view.categories.length > 0;

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

      {showTree && (
        <div className="filters__group">
          <div className="section-title">Категории</div>
          <ul className="tree">
            <TreeItem label="Все" count={view.allCount} active={!filters.cat} onClick={() => onChange({ cat: '' })} />
            {view.categories.map((c) => (
              <TreeItem
                key={c.path}
                label={c.name}
                depth={c.depth}
                count={c.count}
                active={filters.cat === c.path}
                onClick={() => onChange({ cat: c.path })}
              />
            ))}
            {view.uncategorizedCount > 0 || filters.cat === NO_CATEGORY ? (
              <TreeItem
                label="Без категории"
                muted
                count={view.uncategorizedCount}
                active={filters.cat === NO_CATEGORY}
                onClick={() => onChange({ cat: NO_CATEGORY })}
              />
            ) : null}
          </ul>
        </div>
      )}

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

function TreeItem(props: {
  label: string;
  count: number;
  active: boolean;
  depth?: number;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`tree__item${props.active ? ' active' : ''}${props.muted ? ' muted' : ''}`}
        style={{ paddingLeft: 10 + (props.depth ?? 0) * 14 }}
        onClick={props.onClick}
      >
        <span className="tree__label">{props.label}</span>
        <span className="tree__count num">{formatInt(props.count)}</span>
      </button>
    </li>
  );
}
