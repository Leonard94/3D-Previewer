import type { ReactNode } from 'react';
import { VERTEX_ATTRIBUTES, type ModelDetails } from '../../../../shared/types.ts';
import { Section } from '../../components/ui.tsx';
import { formatBytes, formatCm, formatDensity, formatInt, formatLength, formatLengthValue, textureSizeLabel } from '../../format.ts';
import { ATTRIBUTE_HINTS, ATTRIBUTE_LABELS, PRESENCE_LABELS } from '../../labels.ts';
import { useViewer } from '../../store/viewer.ts';

function Metric({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`metric${wide ? ' metric--wide' : ''}`}>
      <div className={`metric__label${hint ? ' has-hint' : ''}`} data-hint={hint}>
        {label}
      </div>
      <div className="metric__value num">{children}</div>
    </div>
  );
}

const Sub = ({ children }: { children: ReactNode }) => <div className="metric__sub">{children}</div>;

export function StatsSection({ model }: { model: ModelDetails }) {
  const dimUnit = useViewer((st) => st.dimUnit);
  const s = model.stats;
  if (!s) return null;
  const m = s.materials;
  const t = s.textures;
  const [sx, sy, sz] = s.size;
  const density = model.texelDensity;

  return (
    <Section title="Статистика">
      <div className="stats-hero">
        <span className="stats-hero__value num">{formatInt(s.triangles)}</span>
        <span className="stats-hero__label">треугольников</span>
        {s.trianglesUnique !== s.triangles && (
          <span className="stats-hero__extra muted num has-hint" data-hint="Каждый меш учтён один раз (без повторов экземпляров)">
            уникальных {formatInt(s.trianglesUnique)}
          </span>
        )}
      </div>
      <p className="stats-note muted">Треугольники — без LOD: в игре Godot сам упрощает модели вдали.</p>

      <div className="metrics">
        <Metric
          label="Вершины"
          hint="Вершины для видеокарты. Их больше, чем показывает Blender: при экспорте вершина копируется на каждом UV-шве, жёстком ребре и стыке материалов. Именно это число влияет на производительность в Godot."
        >
          {formatInt(s.vertices)}
        </Metric>
        <Metric label="Объекты" hint="Узлы с мешем">
          {formatInt(s.objects)}
        </Metric>
        <Metric
          label="Поверхности"
          hint="Примитивы по всем экземплярам. В Godot каждая поверхность — отдельный вызов отрисовки, тени добавляют проходы"
        >
          {formatInt(s.surfaces)}
          <Sub>≈ вызовов отрисовки за проход</Sub>
        </Metric>
        <Metric label="Материалы" hint="Уникальные используемые материалы">
          {formatInt(m.total)}
          <Sub>
            {m.opaque} непрозр. · {m.mask} с отсеч. · {m.blend} полупрозр.
            {(m.doubleSided > 0 || m.unlit > 0) && (
              <>
                <br />
                {m.doubleSided > 0 && `${m.doubleSided} двусторонн.`}
                {m.doubleSided > 0 && m.unlit > 0 && ' · '}
                {m.unlit > 0 && `${m.unlit} unlit`}
              </>
            )}
          </Sub>
        </Metric>
        <Metric label="Текстуры">
          {t.count > 0 ? (
            <>
              {formatInt(t.count)}
              <Sub>
                макс. {t.maxWidth}×{t.maxHeight} ({textureSizeLabel(Math.max(t.maxWidth, t.maxHeight))}) · {formatBytes(t.fileBytes)}
              </Sub>
            </>
          ) : (
            '—'
          )}
        </Metric>
        <Metric
          label="Видеопамять"
          hint="Несжатая — как в браузере (RGBA + мипмапы). Godot — оценка для VRAM Compressed на десктопе: реальный формат зависит от настроек импорта"
        >
          {t.count > 0 ? (
            <>
              ≈ {formatBytes(t.vramGodot)} <span className="metric__tag">Godot, оценка</span>
              <Sub>
                несжатая {formatBytes(t.vramUncompressed)}
                {t.compressedCount > 0 && ` · ${t.compressedCount} уже сжатых (KTX2)`}
              </Sub>
            </>
          ) : (
            '—'
          )}
        </Metric>
        <Metric label="Габариты" hint="Мировой AABB всех мешей: X × Y × Z" wide>
          {formatLengthValue(sx, dimUnit)} × {formatLengthValue(sy, dimUnit)} × {formatLength(sz, dimUnit)}
          <Sub>
            низ модели:{' '}
            {Math.abs(s.minY) <= 0.0005 ? 'на полу' : s.minY > 0 ? `над полом на ${formatCm(s.minY)}` : `под полом на ${formatCm(s.minY)}`}
          </Sub>
        </Metric>
        <Metric label="Файл" wide>
          {formatBytes(s.fileBytes.total)}
          <Sub>
            изображения {formatBytes(s.fileBytes.images)} · геометрия {formatBytes(s.fileBytes.geometry)} · прочее{' '}
            {formatBytes(s.fileBytes.other)}
          </Sub>
        </Metric>
        <Metric
          label="Плотность текселей"
          hint="Сколько пикселей текстуры приходится на метр поверхности (по Base Color). Медиана и разброс p10–p90 по площади. Модели одной сцены должны быть близки, чтобы выглядеть одинаково детально"
          wide
        >
          {density ? (
            <>
              {formatDensity(density.median)}
              <Sub>
                p10–p90: {formatInt(Math.round(density.p10))}–{formatDensity(density.p90)}
              </Sub>
            </>
          ) : (
            '—'
          )}
        </Metric>
        {(s.lines > 0 || s.points > 0 || s.morphTargets > 0) && (
          <Metric label="Прочее" wide>
            <Sub>
              {[s.lines > 0 && `линий ${formatInt(s.lines)}`, s.points > 0 && `точек ${formatInt(s.points)}`, s.morphTargets > 0 && `morph targets ${s.morphTargets}`]
                .filter(Boolean)
                .join(' · ')}
            </Sub>
          </Metric>
        )}
      </div>

      <div className="stats-sub-title section-title">Атрибуты вершин</div>
      <ul className="attrs">
        {VERTEX_ATTRIBUTES.map((a) => (
          <li key={a} className={`attrs__item attrs__item--${s.attributes[a]}`}>
            <span className="attrs__dot" aria-hidden />
            <span className={ATTRIBUTE_HINTS[a] ? 'has-hint' : undefined} data-hint={ATTRIBUTE_HINTS[a]}>
              {ATTRIBUTE_LABELS[a]}
            </span>
            <span className="attrs__code mono">{a}</span>
            <span className="attrs__state">{PRESENCE_LABELS[s.attributes[a]]}</span>
          </li>
        ))}
      </ul>

      <div className="stats-sub-title section-title">Расширения glTF</div>
      {model.extensionsUsed.length === 0 ? (
        <p className="muted stats-ext">нет</p>
      ) : (
        <ul className="stats-ext-list">
          {model.extensionsUsed.map((e) => (
            <li key={e} className="mono">
              {e}
              {model.extensionsRequired.includes(e) && <span className="metric__tag">required</span>}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
