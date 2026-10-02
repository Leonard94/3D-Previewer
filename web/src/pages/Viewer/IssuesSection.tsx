import { useState } from 'react';
import type { Issue, IssueLevel, IssueTarget, ModelDetails } from '../../../../shared/types.ts';
import { Section } from '../../components/ui.tsx';
import { useViewer } from '../../store/viewer.ts';

const LEVEL_LABELS: Record<IssueLevel, string> = { error: 'Ошибка', warning: 'Предупреждение', info: 'Инфо' };
const TARGET_LABELS: Record<IssueTarget['kind'], string> = { object: 'Объект', material: 'Материал', texture: 'Текстура' };
/** Сколько целей показывать до «ещё N». */
const TARGETS_PREVIEW = 6;

/**
 * Проверки модели. Раскрыта, если есть ошибки или предупреждения; если только инфо — свёрнута.
 * Если ошибки или предупреждения появились уже при открытой вкладке — раскрывается сама.
 */
export function IssuesSection({ model }: { model: ModelDetails }) {
  const { issues } = model;
  const counts = model.issueCounts;
  const serious = counts.error + counts.warning > 0;
  const [open, setOpen] = useState(serious);
  // Появились ошибки или предупреждения (например, сохранили .blend) — раскрыть секцию.
  const [wasSerious, setWasSerious] = useState(serious);
  if (serious !== wasSerious) {
    setWasSerious(serious);
    if (serious) setOpen(true);
  }

  const aside =
    issues.length === 0 ? (
      <span className="issues__ok">нет</span>
    ) : (
      (['error', 'warning', 'info'] as const).map(
        (level) =>
          counts[level] > 0 && (
            <span key={level} className={`badge ${level}`} data-hint={LEVEL_LABELS[level]}>
              {counts[level]}
            </span>
          ),
      )
    );

  return (
    <Section title="Предупреждения" open={open} onToggle={setOpen} aside={aside}>
      {issues.length === 0 ? (
        <p className="muted issues__empty">Проблем экспорта не найдено.</p>
      ) : (
        <ul className="issues">
          {issues.map((issue) => (
            <IssueItem key={issue.code} issue={issue} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function IssueItem({ issue }: { issue: Issue }) {
  const [allTargets, setAllTargets] = useState(false);
  const targets = issue.targets ?? [];
  const shown = allTargets ? targets : targets.slice(0, TARGETS_PREVIEW);
  const hidden = targets.length - shown.length;

  return (
    <li className={`issue issue--${issue.level}`}>
      <div className="issue__head">
        <span className="issue__code" data-hint={LEVEL_LABELS[issue.level]}>
          {issue.code}
        </span>
        <span className="issue__message">{issue.message}</span>
      </div>
      {issue.hint && (
        <div className="issue__hint">
          <span className="issue__hint-label">Как исправить:</span> {issue.hint}
        </div>
      )}
      {targets.length > 0 && (
        <div className="issue__targets">
          {shown.map((t, i) =>
            t.kind === 'object' ? (
              // Объект можно выделить: обводка в сцене и вписывание в кадр.
              <button
                type="button"
                key={`${t.kind}-${t.name}-${i}`}
                className="issue__target issue__target--object"
                data-hint="Объект — выделить в сцене"
                onClick={() => useViewer.getState().selectObject(t.name, { focus: true })}
                onMouseEnter={() => useViewer.getState().setHovered(t.name)}
                onMouseLeave={() => useViewer.getState().setHovered(null)}
              >
                {t.name}
              </button>
            ) : (
              <span key={`${t.kind}-${t.name}-${i}`} className={`issue__target issue__target--${t.kind}`} data-hint={TARGET_LABELS[t.kind]}>
                {t.name}
              </span>
            ),
          )}
          {hidden > 0 && (
            <button type="button" className="issue__more" onClick={() => setAllTargets(true)}>
              ещё {hidden}
            </button>
          )}
        </div>
      )}
      {issue.details && issue.details.length > 0 && (
        <details className="issue__details">
          <summary>Подробности</summary>
          <ul>
            {issue.details.map((d, i) => (
              <li key={i} className="mono">
                {d}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}
