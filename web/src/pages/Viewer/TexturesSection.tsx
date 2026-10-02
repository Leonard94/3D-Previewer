import { useMemo, useState } from 'react';
import type { ModelDetails, TextureInfo } from '../../../../shared/types.ts';
import { Modal } from '../../components/Modal.tsx';
import { Section } from '../../components/ui.tsx';
import { formatBytes, formatInt, textureSizeLabel } from '../../format.ts';
import { ALPHA_LABELS, SLOT_LABELS, formatLabel } from '../../labels.ts';

const imageUrl = (model: ModelDetails, index: number, full = false) =>
  `/api/models/${encodeURIComponent(model.id)}/images/${index}?v=${model.hash}${full ? '&full=1' : ''}`;

const slotsText = (t: TextureInfo) => (t.slots.length ? t.slots.map((s) => SLOT_LABELS[s]).join(', ') : 'не используется');
const sizeText = (t: TextureInfo) => `${t.width}×${t.height}`;
const sizeLabel = (t: TextureInfo) => textureSizeLabel(Math.max(t.width, t.height));

function Preview({ model, t, onOpen, size }: { model: ModelDetails; t: TextureInfo; onOpen: (t: TextureInfo) => void; size: number }) {
  if (!t.hasPreview) return <span className="tex-thumb tex-thumb--none" style={{ width: size, height: size }}>{formatLabel(t.mimeType)}</span>;
  return (
    <button type="button" className="tex-thumb" style={{ width: size, height: size }} onClick={() => onOpen(t)} data-hint="Открыть крупно">
      <img src={imageUrl(model, t.index)} alt="" loading="lazy" />
    </button>
  );
}

export function TexturesSection({ model }: { model: ModelDetails }) {
  const [zoom, setZoom] = useState<TextureInfo | null>(null);
  const [tableOpen, setTableOpen] = useState(false);

  // По видеопамяти, по убыванию.
  const sorted = useMemo(
    () => [...model.textures].sort((a, b) => b.vramUncompressed - a.vramUncompressed || a.index - b.index),
    [model.textures],
  );
  const totals = useMemo(
    () => ({
      file: sorted.reduce((s, t) => s + t.fileBytes, 0),
      raw: sorted.reduce((s, t) => s + t.vramUncompressed, 0),
      godot: sorted.reduce((s, t) => s + (t.vramGodot ?? 0), 0),
    }),
    [sorted],
  );

  if (model.textures.length === 0) {
    return (
      <Section title="Текстуры">
        <p className="muted">В модели нет текстур.</p>
      </Section>
    );
  }

  return (
    <Section title="Текстуры" aside={<span className="section-count num">{sorted.length}</span>}>
      <ul className="tex-list">
        {sorted.map((t) => (
          <li key={t.index} className="tex-row">
            <Preview model={model} t={t} onOpen={setZoom} size={44} />
            <div className="tex-row__main">
              <div className="tex-row__name" title={t.name}>
                {t.name}
              </div>
              <div className="tex-row__slots muted">{slotsText(t)}</div>
            </div>
            <div className="tex-row__side num">
              <div>
                <span className="tex-row__label">{sizeLabel(t)}</span> {formatLabel(t.mimeType)}
              </div>
              <div className="muted" data-hint="Видеопамять в Godot (оценка)">
                {t.vramGodot !== null ? `≈ ${formatBytes(t.vramGodot)}` : 'сжатая'}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="tex-total num muted">
        Всего: {formatBytes(totals.file)} в файле · VRAM ≈ {formatBytes(totals.godot)} в Godot (несжатая {formatBytes(totals.raw)})
      </div>
      <button type="button" className="btn tex-table-btn" onClick={() => setTableOpen(true)}>
        Подробная таблица
      </button>

      {tableOpen && (
        <Modal title={`Текстуры — ${model.title}`} onClose={() => setTableOpen(false)} wide>
          <div className="tex-table-wrap">
            <table className="tex-table">
              <thead>
                <tr>
                  <th />
                  <th>Имя</th>
                  <th>Назначение</th>
                  <th>Разрешение</th>
                  <th>Формат</th>
                  <th className="r">В файле</th>
                  <th className="r has-hint" data-hint="RGBA + мипмапы, как в браузере">
                    VRAM несжатая
                  </th>
                  <th className="r has-hint" data-hint="VRAM Compressed на десктопе; реальный формат зависит от настроек импорта">
                    VRAM Godot, оценка
                  </th>
                  <th>Альфа</th>
                  <th className="r">Материалов</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((t) => (
                  <tr key={t.index}>
                    <td>
                      <Preview model={model} t={t} onOpen={setZoom} size={40} />
                    </td>
                    <td className="tex-table__name" title={t.name}>
                      {t.name}
                    </td>
                    <td>{slotsText(t)}</td>
                    <td className="num">
                      {sizeText(t)} <span className="tex-row__label">{sizeLabel(t)}</span>
                      {!t.pot && <span className="metric__tag" data-hint="Сторона не степень двойки">NPOT</span>}
                    </td>
                    <td>{formatLabel(t.mimeType)}</td>
                    <td className="r num">{formatBytes(t.fileBytes)}</td>
                    <td className="r num">{formatBytes(t.vramUncompressed)}</td>
                    <td className="r num">
                      {t.vramGodot !== null ? (
                        <>
                          {formatBytes(t.vramGodot)} <span className="muted">{t.godotFormat}</span>
                        </>
                      ) : (
                        'сжатая'
                      )}
                    </td>
                    <td>{t.alpha ? ALPHA_LABELS[t.alpha] : '?'}</td>
                    <td className="r num">{formatInt(t.materialCount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td />
                  <td colSpan={4}>Итого: {sorted.length}</td>
                  <td className="r num">{formatBytes(totals.file)}</td>
                  <td className="r num">{formatBytes(totals.raw)}</td>
                  <td className="r num">{formatBytes(totals.godot)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </Modal>
      )}

      {zoom && (
        <Modal
          title={
            <>
              {zoom.name} <span className="muted num">· {sizeText(zoom)} · {slotsText(zoom)}</span>
            </>
          }
          onClose={() => setZoom(null)}
        >
          <img className="tex-zoom" src={imageUrl(model, zoom.index, true)} alt={zoom.name} />
        </Modal>
      )}
    </Section>
  );
}
