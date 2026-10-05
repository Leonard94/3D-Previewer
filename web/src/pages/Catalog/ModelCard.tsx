import { memo, useEffect, useRef, useState } from 'react';
import type { ModelSummary } from '../../../../shared/types.ts';
import { thumbUrl } from '../../api/client.ts';
import { formatInt, textureSizeLabel } from '../../format.ts';
import { useCatalog } from '../../store/catalog.ts';
import { observeCard, useThumbs } from '../../thumbs/queue.ts';

const MAX_TAGS = 3;

interface Props {
  model: ModelSummary;
  index: number;
  /** Меняется при каждом живом обновлении — перезапускает подсветку. */
  flashKey?: number;
}

export const ModelCard = memo(function ModelCard({ model: m, index, flashKey }: Props) {
  const extraTags = m.tags.length - MAX_TAGS;
  const broken = Boolean(m.analysisError);
  const { error, warning } = m.issueCounts;
  const thumbFailed = useThumbs((s) => s.failed[m.hash]);
  const thumbVersion = useCatalog((s) => s.thumbsReset);
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const showImage = m.hasThumb && !imageError && !broken;

  // Карточка без миниатюры сообщает очереди, видна ли она, — видимые рендерятся первыми.
  const thumbRef = useRef<HTMLDivElement>(null);
  const needsThumb = !m.hasThumb && !broken;
  useEffect(() => {
    const el = thumbRef.current;
    return needsThumb && el ? observeCard(el, m.id) : undefined;
  }, [needsThumb, m.id]);

  // Новая миниатюра (другой хеш или перегенерация) — заново ждём загрузку.
  const src = thumbUrl(m.hash, thumbVersion);
  const [prevSrc, setPrevSrc] = useState(src);
  if (src !== prevSrc) {
    setPrevSrc(src);
    setImageError(false);
    setImageLoaded(false);
  }

  return (
    <a
      className={`card${broken ? ' card--broken' : ''}`}
      href={`/view?model=${encodeURIComponent(m.id)}`}
      target="_blank"
      rel="noreferrer"
      title={m.id}
    >
      <div className="card__thumb" ref={thumbRef}>
        {showImage && (
          <img
            className={`card__thumb-img${imageLoaded ? ' loaded' : ''}`}
            src={src}
            alt=""
            decoding="async"
            onLoad={() => setImageLoaded(true)}
            onError={() => setImageError(true)}
          />
        )}
        {broken ? (
          <div className="card__thumb-error">
            <span className="card__thumb-error-icon">!</span>
            <span>Файл не читается</span>
          </div>
        ) : showImage && imageLoaded ? null : (
          <div
            className="card__thumb-placeholder"
            aria-label={thumbFailed ? 'Миниатюру не удалось сделать' : 'Миниатюра готовится'}
            data-hint={thumbFailed ? `Миниатюру не удалось сделать: ${thumbFailed}` : undefined}
          >
            <svg viewBox="0 0 48 48" width="44" height="44" aria-hidden>
              <path d="M24 6 40 15v18L24 42 8 33V15z" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 15l16 9 16-9M24 24v18" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
            {!thumbFailed && <span className="card__thumb-bar" />}
          </div>
        )}
        <div className="card__files">
          <span className="card__file">glb</span>
          {m.blendFile && <span className="card__file">blend</span>}
        </div>
        {(error > 0 || warning > 0) && (
          <div className="card__badges">
            {error > 0 && (
              <span className="badge error" data-hint="Ошибки">
                {error}
              </span>
            )}
            {warning > 0 && (
              <span className="badge warning" data-hint="Предупреждения">
                {warning}
              </span>
            )}
          </div>
        )}
        {flashKey !== undefined && <span className="card__flash" key={flashKey} />}
      </div>

      <div className="card__body">
        <div className="card__title">
          <span className="card__num num">{String(index + 1).padStart(2, '0')}</span>
          <span className="card__name">{m.title}</span>
        </div>

        {m.tags.length > 0 && (
          <div className="card__meta">
            {m.tags.slice(0, MAX_TAGS).map((t) => (
              <span key={t} className="card__tag">
                {t}
              </span>
            ))}
            {extraTags > 0 && (
              <span className="card__tag card__tag--more" data-hint={m.tags.slice(MAX_TAGS).join(', ')}>
                +{extraTags}
              </span>
            )}
          </div>
        )}

        <div className="card__stats num muted">
          {broken ? (
            <span className="card__error-text">{m.analysisError}</span>
          ) : (
            <>
              <span>{m.triangles !== null ? `${formatInt(m.triangles)} треуг.` : '— треуг.'}</span>
              {m.maxTextureSize !== null && <span>{textureSizeLabel(m.maxTextureSize)}</span>}
            </>
          )}
        </div>
      </div>
    </a>
  );
});
