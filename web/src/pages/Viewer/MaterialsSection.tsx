import type { MaterialInfo, ModelDetails } from '../../../../shared/types.ts';
import { Section } from '../../components/ui.tsx';
import { formatInt, plural } from '../../format.ts';

const ALPHA_LABELS: Record<MaterialInfo['alphaMode'], string> = {
  OPAQUE: 'непрозрачный',
  MASK: 'отсечение',
  BLEND: 'полупрозрачный',
};

const ALPHA_HINTS: Record<MaterialInfo['alphaMode'], string> = {
  OPAQUE: 'OPAQUE — альфа не используется',
  MASK: 'MASK — пиксели отсекаются по порогу альфы',
  BLEND: 'BLEND — смешивание; в Godot дороже и с проблемами сортировки',
};

/** Материалы модели (по умолчанию свёрнуто). */
export function MaterialsSection({ model }: { model: ModelDetails }) {
  const materials = [...model.materials].sort((a, b) => Number(b.used) - Number(a.used) || b.objectCount - a.objectCount);
  return (
    <Section title="Материалы" defaultOpen={false} aside={<span className="muted num section-count">{model.stats?.materials.total ?? 0}</span>}>
      {materials.length === 0 ? (
        <p className="muted objects__empty">Материалов нет.</p>
      ) : (
        <ul className="materials">
          {materials.map((m) => (
            <li key={m.index} className={`material${m.used ? '' : ' unused'}`}>
              <div className="material__head">
                <span className="material__name" title={m.name}>
                  {m.name}
                </span>
                <span className="muted num material__count">
                  {m.used ? `${formatInt(m.objectCount)} ${plural(m.objectCount, ['объект', 'объекта', 'объектов'])}` : 'не используется'}
                </span>
              </div>
              <div className="material__chips">
                <span className={`mat-chip mat-chip--${m.alphaMode.toLowerCase()}`} data-hint={ALPHA_HINTS[m.alphaMode]}>
                  {ALPHA_LABELS[m.alphaMode]}
                </span>
                {m.doubleSided && (
                  <span className="mat-chip" data-hint="Рисуются обе стороны полигонов">
                    двусторонний
                  </span>
                )}
                {m.unlit && (
                  <span className="mat-chip" data-hint="KHR_materials_unlit — без освещения">
                    unlit
                  </span>
                )}
              </div>
              {m.textures.length > 0 && (
                <div className="material__textures muted">
                  {m.textures.map((i) => model.textures[i]?.name ?? `image_${i}`).join(', ')}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
