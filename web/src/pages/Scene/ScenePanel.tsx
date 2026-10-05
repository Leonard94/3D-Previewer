import { useState } from 'react';
import { Link } from 'react-router';
import type { ModelSummary } from '../../../../shared/types.ts';
import { thumbUrl } from '../../api/client.ts';
import { Section } from '../../components/ui.tsx';
import { formatInt } from '../../format.ts';
import { useCatalog } from '../../store/catalog.ts';
import { useScene, type ItemStatus, type SceneItem } from '../../store/scene.ts';
import { useViewer } from '../../store/viewer.ts';
import { EyeIcon } from '../Viewer/ObjectsSection.tsx';
import { DisplaySection, LightSection, ViewSection, WetnessSection } from '../Viewer/ViewerPanel.tsx';
import { CrossIcon, OpenIcon, PlusIcon } from './icons.tsx';

export function ScenePanel({ onAdd }: { onAdd: () => void }) {
  return (
    <aside className="viewer__panel">
      <header className="viewer__head">
        <div className="viewer__title-row">
          <SceneTitle />
          <Link to="/" className="btn btn--small">
            Каталог
          </Link>
        </div>
        <p className="viewer__desc">Сохраняется сама, в этом браузере. Все сцены — на главной, над каталогом.</p>
      </header>

      <ModelsSection onAdd={onAdd} />
      <ViewSection />
      <LightSection />
      <WetnessSection />
      <DisplaySection />
    </aside>
  );
}

/** Название сцены — правится прямо в заголовке. Enter или уход фокуса — сохранить, Esc — отменить. */
function SceneTitle() {
  const title = useScene((s) => s.title);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) useScene.getState().rename(draft);
    setDraft(null);
  };
  return (
    <input
      className="viewer__title scene-title"
      value={draft ?? title}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          setDraft(null);
          // Черновик уже сброшен — уход фокуса ничего не сохранит.
          requestAnimationFrame(() => (e.target as HTMLInputElement).blur());
        }
      }}
      maxLength={80}
      spellCheck={false}
      aria-label="Название сцены"
      data-hint="Переименовать"
    />
  );
}

function ModelsSection({ onAdd }: { onAdd: () => void }) {
  const items = useScene((s) => s.items);
  const status = useScene((s) => s.status);
  const models = useCatalog((s) => s.models);
  return (
    <Section title="Модели" aside={<span className="muted num section-count">{items.length}</span>}>
      {items.length > 0 && (
        <ul className="objects scene-models">
          {items.map((item) => (
            <ModelRow key={item.uid} item={item} model={models[item.modelId]} status={status[item.uid]} />
          ))}
        </ul>
      )}
      <button type="button" className="btn btn--small scene-models__add" onClick={onAdd}>
        <PlusIcon /> Добавить модель
      </button>
    </Section>
  );
}

/** Последние известные названия: у удалённого файла в списке остаётся название, а не путь. */
const knownTitles = new Map<string, string>();

function ModelRow({ item, model, status }: { item: SceneItem; model: ModelSummary | undefined; status: ItemStatus | undefined }) {
  const scene = useScene.getState;
  const thumbsReset = useCatalog((s) => s.thumbsReset);
  const selected = useScene((s) => s.selected === item.uid);
  const ready = status?.state === 'ready' || status?.state === 'missing';
  if (model) knownTitles.set(model.id, model.title);
  const title = model?.title ?? knownTitles.get(item.modelId) ?? item.modelId;
  return (
    <li
      className={`obj scene-model${item.hidden ? ' hidden' : ''}${selected ? ' selected' : ''}`}
      // Клик по строке — выделить модель и вписать её в кадр; повторный — снять выделение.
      onClick={() => {
        if (selected) return scene().select(null);
        if (!ready || item.hidden) return;
        scene().select(item.uid);
        useViewer.getState().frameObject(item.uid);
      }}
    >
      <button
        type="button"
        className="obj__icon"
        aria-label={item.hidden ? 'Показать' : 'Скрыть'}
        data-hint={item.hidden ? 'Показать' : 'Скрыть'}
        onClick={(e) => {
          e.stopPropagation();
          scene().toggleHidden(item.uid);
        }}
      >
        <EyeIcon open={!item.hidden} />
      </button>
      <span className="scene-model__thumb">
        {model?.hasThumb && <img src={thumbUrl(model.hash, thumbsReset)} alt="" decoding="async" />}
      </span>
      <div className="obj__main">
        <div className="obj__name" title={item.modelId}>
          {title}
        </div>
        <StatusLine status={status} model={model} />
      </div>
      <a
        className="obj__icon"
        href={`/view?model=${encodeURIComponent(item.modelId)}`}
        target="_blank"
        rel="noreferrer"
        aria-label="Открыть в инспекторе"
        data-hint="Открыть в инспекторе"
        onClick={(e) => e.stopPropagation()}
      >
        <OpenIcon />
      </a>
      <button
        type="button"
        className="obj__icon"
        aria-label="Убрать из сцены"
        data-hint="Убрать из сцены"
        onClick={(e) => {
          e.stopPropagation();
          scene().remove(item.uid);
        }}
      >
        <CrossIcon />
      </button>
    </li>
  );
}

function StatusLine({ status, model }: { status: ItemStatus | undefined; model: ModelSummary | undefined }) {
  if (status?.state === 'missing') return <div className="obj__sub scene-model__warn">Файл удалён или переименован</div>;
  if (status?.state === 'error')
    return (
      <div className="obj__sub scene-model__error" title={status.message}>
        Не открывается: {status.message}
      </div>
    );
  if (!status || status.state === 'loading') return <div className="obj__sub muted">Загрузка…</div>;
  return (
    <div className="obj__sub muted">
      {model?.triangles != null && <span className="num">{formatInt(model.triangles)} треуг.</span>}
    </div>
  );
}
