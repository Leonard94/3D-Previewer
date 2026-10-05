import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { thumbUrl } from '../../api/client.ts';
import { Modal } from '../../components/Modal.tsx';
import { useDismiss } from '../../components/useDismiss.ts';
import { formatDate, plural } from '../../format.ts';
import { useCatalog } from '../../store/catalog.ts';
import { deleteScene, duplicateScene, newSceneId, renameScene, useSceneList, type SavedScene } from '../../store/sceneLibrary.ts';
import { PlusIcon } from '../Scene/icons.tsx';

/** Сколько миниатюр моделей в карточке сцены. */
const MOSAIC_SIZE = 4;

/** Сохранённые сцены — рядом над каталогом моделей. */
export function ScenesSection() {
  const scenes = useSceneList();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState<SavedScene | null>(null);

  return (
    <section className="scenes">
      <div className="scenes__head">
        <span className="section-title">Сцены</span>
        {scenes.length > 0 && <span className="muted num section-count">{scenes.length}</span>}
        <span className="muted scenes__note">Несколько моделей вместе. Хранятся в этом браузере.</span>
      </div>
      <ul className="scenes__row">
        <li>
          <button type="button" className="scene-card scene-card--new" onClick={() => navigate(`/scene/${newSceneId()}`)}>
            <PlusIcon />
            Новая сцена
          </button>
        </li>
        {scenes.map((s) => (
          <li key={s.id}>
            <SceneCard scene={s} onDelete={() => setDeleting(s)} />
          </li>
        ))}
      </ul>
      {deleting && (
        <Modal title="Удалить сцену?" onClose={() => setDeleting(null)}>
          <p className="scenes__confirm">
            «{deleting.title}» пропадёт без возможности вернуть. Сами модели останутся на месте.
          </p>
          <div className="scenes__confirm-actions">
            <button type="button" className="btn" onClick={() => setDeleting(null)}>
              Отмена
            </button>
            <button
              type="button"
              className="btn primary"
              autoFocus
              onClick={() => {
                deleteScene(deleting.id);
                setDeleting(null);
              }}
            >
              Удалить
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function SceneCard({ scene, onDelete }: { scene: SavedScene; onDelete: () => void }) {
  const [renaming, setRenaming] = useState(false);
  const count = scene.items.length;
  return (
    <div className="scene-card">
      <Link to={`/scene/${scene.id}`} className="scene-card__link" title={scene.title}>
        <Mosaic scene={scene} />
        <div className="scene-card__body">
          {renaming ? (
            <RenameInput scene={scene} onDone={() => setRenaming(false)} />
          ) : (
            <span className="scene-card__title">{scene.title}</span>
          )}
          <span className="scene-card__meta muted num">
            {count} {plural(count, ['модель', 'модели', 'моделей'])} · {formatDate(scene.updatedAt)}
          </span>
        </div>
      </Link>
      <CardMenu scene={scene} onRename={() => setRenaming(true)} onDelete={onDelete} />
    </div>
  );
}

/** Миниатюры первых моделей сцены — без отдельного рендера самой сцены. */
function Mosaic({ scene }: { scene: SavedScene }) {
  const models = useCatalog((s) => s.models);
  const thumbsReset = useCatalog((s) => s.thumbsReset);
  const thumbs = [...new Set(scene.items.map((i) => i.modelId))]
    .map((id) => models[id])
    .filter((m) => m?.hasThumb)
    .slice(0, MOSAIC_SIZE);
  return (
    <div className={`scene-card__mosaic scene-card__mosaic--${thumbs.length}`}>
      {thumbs.map((m) => (
        <img key={m!.id} src={thumbUrl(m!.hash, thumbsReset)} alt="" decoding="async" />
      ))}
      {thumbs.length === 0 && <span className="muted scene-card__empty">{scene.items.length ? '' : 'Пустая'}</span>}
    </div>
  );
}

function RenameInput({ scene, onDone }: { scene: SavedScene; onDone: () => void }) {
  const [value, setValue] = useState(scene.title);
  const cancelled = useRef(false);
  return (
    <input
      className="input scene-card__rename"
      value={value}
      autoFocus
      onFocus={(e) => e.target.select()}
      // Поле внутри ссылки на сцену: клик по нему не должен её открывать.
      onClick={(e) => e.preventDefault()}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (!cancelled.current) renameScene(scene.id, value);
        onDone();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.stopPropagation();
          cancelled.current = true;
          e.currentTarget.blur();
        }
      }}
      maxLength={80}
      spellCheck={false}
      aria-label="Название сцены"
    />
  );
}

function CardMenu({ scene, onRename, onDelete }: { scene: SavedScene; onRename: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, rootRef, close);
  const run = (action: () => void) => {
    close();
    action();
  };
  return (
    <div className={`scene-card__menu${open ? ' open' : ''}`} ref={rootRef}>
      <button
        type="button"
        className="scene-card__menu-btn"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label="Действия со сценой"
      >
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden>
          <circle cx="3.5" cy="8" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="12.5" cy="8" r="1.3" />
        </svg>
      </button>
      {open && (
        <div className="scene-card__pop">
          <button type="button" className="scene-card__item" onClick={() => run(onRename)}>
            Переименовать
          </button>
          <button type="button" className="scene-card__item" onClick={() => run(() => duplicateScene(scene.id))}>
            Дублировать
          </button>
          <button type="button" className="scene-card__item scene-card__item--danger" onClick={() => run(onDelete)}>
            Удалить
          </button>
        </div>
      )}
    </div>
  );
}
