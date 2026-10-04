import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModelDetails, ObjectInfo } from '../../../../shared/types.ts';
import { Section } from '../../components/ui.tsx';
import { formatDensity, formatInt } from '../../format.ts';
import { useViewer } from '../../store/viewer.ts';

/** Больше строк сразу не рисуем — у сцен бывает тысяча объектов. */
const PAGE = 150;
/** С какого числа объектов показывать поиск. */
const FILTER_FROM = 12;

/**
 * Список узлов с мешами, самые тяжёлые сверху. Наведение подсвечивает объект в сцене,
 * клик — выделяет обводкой и вписывает в кадр, «глаз» скрывает, «изолировать» оставляет только его.
 */
export function ObjectsSection({ model }: { model: ModelDetails }) {
  const hidden = useViewer((s) => s.hidden);
  const isolated = useViewer((s) => s.isolated);
  const selected = useViewer((s) => s.selected);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const listRef = useRef<HTMLUListElement>(null);

  const sorted = useMemo(() => [...model.objects].sort((a, b) => b.triangles - a.triangles), [model.objects]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (q ? sorted.filter((o) => o.name.toLowerCase().includes(q) || o.materials.some((m) => m.toLowerCase().includes(q))) : sorted),
    [sorted, q],
  );

  // Выделили объект из предупреждения — показать его в списке.
  useEffect(() => {
    if (!selected) return;
    const idx = filtered.findIndex((o) => o.name === selected);
    if (idx >= limit) setLimit(idx + 1);
    requestAnimationFrame(() =>
      listRef.current?.querySelector(`[data-name="${CSS.escape(selected)}"]`)?.scrollIntoView({ block: 'nearest' }),
    );
    // Только при смене выделения: фильтр и «показать ещё» не должны прокручивать список.
  }, [selected]);

  const s = useViewer.getState;
  const anyHidden = hidden.length > 0 || isolated !== null;

  return (
    <Section title="Объекты" aside={<span className="muted num section-count">{formatInt(model.objects.length)}</span>}>
      {model.objects.length === 0 ? (
        <p className="muted objects__empty">В модели нет объектов с мешами.</p>
      ) : (
        <>
          {(sorted.length >= FILTER_FROM || anyHidden) && (
            <div className="objects__tools">
              {sorted.length >= FILTER_FROM && (
                <input
                  className="input objects__filter"
                  placeholder="Имя объекта или материала"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              )}
              {anyHidden && (
                <button type="button" className="btn btn--small" onClick={() => useViewer.setState({ hidden: [], isolated: null })}>
                  Показать все
                </button>
              )}
            </div>
          )}
          <ul className="objects" ref={listRef} onMouseLeave={() => s().setHovered(null)}>
            {filtered.slice(0, limit).map((o) => (
              <ObjectRow
                key={`${o.nodeIndex}`}
                object={o}
                visible={isolated ? isolated === o.name : !hidden.includes(o.name)}
                isolated={isolated === o.name}
                selected={selected === o.name}
              />
            ))}
          </ul>
          {filtered.length > limit && (
            <button type="button" className="btn btn--small objects__more" onClick={() => setLimit(filtered.length)}>
              Показать ещё {formatInt(filtered.length - limit)}
            </button>
          )}
          {filtered.length === 0 && <p className="muted objects__empty">Ничего не найдено.</p>}
        </>
      )}
    </Section>
  );
}

function ObjectRow({ object: o, visible, isolated, selected }: { object: ObjectInfo; visible: boolean; isolated: boolean; selected: boolean }) {
  const s = useViewer.getState;
  return (
    <li
      className={`obj${selected ? ' selected' : ''}${visible ? '' : ' hidden'}`}
      data-name={o.name}
      onMouseEnter={() => s().setHovered(o.name)}
      onClick={() => s().selectObject(selected ? null : o.name, { focus: !selected })}
    >
      <button
        type="button"
        className="obj__icon"
        aria-label={visible ? 'Скрыть' : 'Показать'}
        data-hint={visible ? 'Скрыть' : 'Показать'}
        onClick={(e) => {
          e.stopPropagation();
          s().toggleHidden(o.name);
        }}
      >
        <EyeIcon open={visible} />
      </button>
      <div className="obj__main">
        <div className="obj__name" title={o.name}>
          {o.name}
          {o.instances > 1 && <span className="muted"> ×{o.instances}</span>}
        </div>
        <div className="obj__sub muted">
          {o.materials.join(', ') || 'без материала'}
          {o.texelDensity && <span className="num"> · {formatDensity(o.texelDensity.median)}</span>}
        </div>
      </div>
      <span className="obj__tris num">{formatInt(o.triangles)}</span>
      <button
        type="button"
        className={`obj__icon${isolated ? ' active' : ''}`}
        aria-label="Изолировать"
        data-hint={isolated ? 'Показать все объекты' : 'Изолировать: показать только этот объект'}
        onClick={(e) => {
          e.stopPropagation();
          s().toggleIsolated(o.name);
        }}
      >
        <IsolateIcon />
      </button>
    </li>
  );
}

export function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8z" fill="none" stroke="currentColor" strokeWidth="1.3" />
      {open ? <circle cx="8" cy="8" r="2" fill="currentColor" /> : <path d="M2.5 13.5l11-11" stroke="currentColor" strokeWidth="1.3" />}
    </svg>
  );
}

function IsolateIcon() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
      <circle cx="8" cy="8" r="2.4" fill="currentColor" />
      <path d="M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3" fill="none" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
