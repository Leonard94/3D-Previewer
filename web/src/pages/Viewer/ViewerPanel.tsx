import type { CSSProperties } from 'react';
import type { ModelDetails } from '../../../../shared/types.ts';
import { Section, Toggle } from '../../components/ui.tsx';
import { useViewer } from '../../store/viewer.ts';
import { LIGHT_PRESETS, LIGHT_PRESET_ORDER, type LightPresetId } from '../../three/lightPresets.ts';
import { VIEW_LABELS, type ViewName } from '../../three/views.ts';
import { DISPLAY_MODE_LABELS } from '../../three/displayModes.ts';
import { IssuesSection } from './IssuesSection.tsx';
import { MaterialsSection } from './MaterialsSection.tsx';
import { ModelMenu } from './ModelMenu.tsx';
import { ObjectsSection } from './ObjectsSection.tsx';
import { StatsSection } from './StatsSection.tsx';
import { TexturesSection } from './TexturesSection.tsx';

const VIEWS: ViewName[] = ['general', 'top', 'side'];

export function ViewerPanel({ model }: { model: ModelDetails | null }) {
  const activeView = useViewer((s) => s.activeView);
  const setView = useViewer((s) => s.setView);
  const rotate = useViewer((s) => s.rotate);
  const setRotate = useViewer((s) => s.setRotate);
  const lightPreset = useViewer((s) => s.lightPreset);
  const setLightPreset = useViewer((s) => s.setLightPreset);
  const envBackground = useViewer((s) => s.envBackground);
  const setEnvBackground = useViewer((s) => s.setEnvBackground);
  const missingHdri = useViewer((s) => s.missingHdri);
  const preset = LIGHT_PRESETS[lightPreset];
  const hdriMissing = preset.environment.type === 'hdri' && missingHdri.includes(preset.environment.url);

  return (
    <aside className="viewer__panel">
      <header className="viewer__head">
        <div className="viewer__title-row">
          <h1 className="viewer__title">{model?.title ?? '…'}</h1>
          {model && <ModelMenu model={model} />}
        </div>
        {model?.description && <p className="viewer__desc">{model.description}</p>}
      </header>

      {model && <IssuesSection key={model.id} model={model} />}

      <Section title="Вид">
        <div className="btn-group">
          {VIEWS.map((v, i) => (
            <button
              key={v}
              type="button"
              className={`btn${activeView === v ? ' active' : ''}`}
              onClick={() => setView(v)}
              data-hint={`Клавиша ${i + 1}`}
            >
              {VIEW_LABELS[v]}
            </button>
          ))}
        </div>
        <div className="viewer__toggles viewer__toggles--spaced">
          <Toggle label="Вращение" checked={rotate} onChange={setRotate} hint="Клавиша R — оборот за 12 с, свет неподвижен" />
        </div>
      </Section>

      <Section title="Свет">
        <select
          className="input viewer__select"
          value={lightPreset}
          onChange={(e) => setLightPreset(e.target.value as LightPresetId)}
          data-hint="Клавиша L — следующий пресет"
        >
          {LIGHT_PRESET_ORDER.map((id) => (
            <option key={id} value={id}>
              {LIGHT_PRESETS[id].label}
            </option>
          ))}
        </select>
        <p className="viewer__note muted">{preset.purpose}</p>
        {preset.background.hdri && (
          <Toggle label="Окружение фоном" checked={envBackground} onChange={setEnvBackground} hint="Размытая HDRI-карта вместо однотонного фона" />
        )}
        {hdriMissing && (
          <p className="viewer__warn">
            HDRI не найден — используется запасное окружение. Запустите <span className="mono">npm run fetch:hdri</span>.
          </p>
        )}
      </Section>

      <WetnessSection />

      <DisplaySection />

      {model?.stats && <ObjectsSection model={model} />}
      {model?.stats && <StatsSection model={model} />}
      {model?.stats && <TexturesSection model={model} />}
      {model?.stats && <MaterialsSection model={model} />}
    </aside>
  );
}

/** Отдельный компонент: ползунок обновляет стор на каждое движение, остальная панель не перерисовывается. */
function WetnessSection() {
  const wetness = useViewer((s) => s.wetness);
  const setWetness = useViewer((s) => s.setWetness);
  const shading = useViewer((s) => s.shading);
  return (
    <Section title="Влажность">
      <div className="wetness">
        <input
          type="range"
          className="slider"
          min={0}
          max={100}
          step={1}
          value={wetness}
          onChange={(e) => setWetness(Number(e.target.value))}
          onDoubleClick={() => setWetness(0)}
          style={{ '--fill': `${wetness}%` } as CSSProperties}
          aria-label="Влажность, %"
          data-hint="Двойной клик — сухо"
        />
        <span className="wetness__value num">{wetness} %</span>
      </div>
      <p className="viewer__note muted">Блики ярче и чётче, цвет темнее, отражения сильнее. Геометрия не меняется.</p>
      {shading !== 'normal' && shading !== 'wireframe' && (
        <p className="viewer__warn">Режим «{DISPLAY_MODE_LABELS[shading]}» показывает материалы без влажности.</p>
      )}
    </Section>
  );
}

function DisplaySection() {
  const grid = useViewer((s) => s.grid);
  const setGrid = useViewer((s) => s.setGrid);
  const mannequin = useViewer((s) => s.mannequin);
  const setMannequin = useViewer((s) => s.setMannequin);
  const dimensions = useViewer((s) => s.dimensions);
  const setDimensions = useViewer((s) => s.setDimensions);
  const shadows = useViewer((s) => s.shadows);
  const setShadows = useViewer((s) => s.setShadows);
  return (
    <Section title="Отображение">
      <div className="viewer__toggles">
        <Toggle label="Сетка" checked={grid} onChange={setGrid} hint="Клавиша G" />
        <Toggle label="Манекен 1,8 м" checked={mannequin} onChange={setMannequin} hint="Клавиша H — для проверки масштаба" />
        <Toggle label="Габариты" checked={dimensions} onChange={setDimensions} hint="Клавиша B — рамка с размерами в метрах" />
        <Toggle label="Тени" checked={shadows} onChange={setShadows} />
      </div>
    </Section>
  );
}
