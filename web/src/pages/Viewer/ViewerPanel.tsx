import type { CSSProperties } from 'react';
import type { ModelDetails } from '../../../../shared/types.ts';
import { CopyButton, Section, Toggle } from '../../components/ui.tsx';
import { useViewer } from '../../store/viewer.ts';
import { LIGHT_PRESETS, LIGHT_PRESET_ORDER, type LightPresetId } from '../../three/lightPresets.ts';
import { VIEW_LABELS, type ViewName } from '../../three/views.ts';
import { WIREFRAME_LABELS, WIREFRAME_MODES } from '../../three/wireframe.ts';
import { api } from '../../api/client.ts';
import { DISPLAY_MODE_HINTS, DISPLAY_MODE_LABELS, DISPLAY_MODES, type DisplayMode } from '../../three/displayModes.ts';
import { IssuesSection } from './IssuesSection.tsx';
import { MaterialsSection } from './MaterialsSection.tsx';
import { ObjectsSection } from './ObjectsSection.tsx';
import { StatsSection } from './StatsSection.tsx';
import { TexturesSection } from './TexturesSection.tsx';

const VIEWS: ViewName[] = ['general', 'top', 'side'];

export function ViewerPanel({ model }: { model: ModelDetails | null }) {
  const activeView = useViewer((s) => s.activeView);
  const setView = useViewer((s) => s.setView);
  const fit = useViewer((s) => s.fit);
  const wireframe = useViewer((s) => s.wireframe);
  const setWireframe = useViewer((s) => s.setWireframe);
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
        <h1 className="viewer__title">{model?.title ?? '…'}</h1>
        {model?.description && <p className="viewer__desc">{model.description}</p>}
        {model && (
          <div className="viewer__paths">
            <PathRow label=".glb" path={model.glbPath} />
            <PathRow label=".blend" path={model.blendPath} />
          </div>
        )}
        {model && <ActionButtons model={model} />}
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
        <button type="button" className="btn viewer__fit" onClick={fit} data-hint="Клавиша F">
          Вписать модель
        </button>
        <div className="viewer__row" data-hint="Клавиша W — по кругу: нет → поверх модели → только каркас">
          <span className="viewer__row-label">Каркас</span>
          <div className="btn-group viewer__row-control">
            {WIREFRAME_MODES.map((m) => (
              <button
                key={m}
                type="button"
                className={`btn btn--small${wireframe === m ? ' active' : ''}`}
                onClick={() => setWireframe(m)}
              >
                {WIREFRAME_LABELS[m]}
              </button>
            ))}
          </div>
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
  const displayMode = useViewer((s) => s.displayMode);
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
      {displayMode !== 'normal' && (
        <p className="viewer__warn">Режим «{DISPLAY_MODE_LABELS[displayMode]}» показывает материалы без влажности.</p>
      )}
    </Section>
  );
}

const IS_MAC = /Mac/i.test(navigator.platform || navigator.userAgent);

function ActionButtons({ model }: { model: ModelDetails }) {
  const run = (action: () => Promise<void>) => {
    action().catch((err: unknown) => useViewer.getState().showToast((err as Error).message));
  };
  return (
    <div className="viewer__actions">
      <button type="button" className="btn btn--small" onClick={() => run(() => api.reveal(model.id))}>
        {IS_MAC ? 'Показать в Finder' : 'Показать в папке'}
      </button>
      {model.blendFile && (
        <button type="button" className="btn btn--small" onClick={() => run(() => api.openBlend(model.id))}>
          Открыть в Blender
        </button>
      )}
      <button
        type="button"
        className="btn btn--small"
        onClick={() => useViewer.getState().requestScreenshot()}
        disabled={Boolean(model.analysisError)}
        data-hint="Клавиша P — PNG текущего кадра в 2×"
      >
        Скриншот
      </button>
    </div>
  );
}

function DisplaySection() {
  const displayMode = useViewer((s) => s.displayMode);
  const setDisplayMode = useViewer((s) => s.setDisplayMode);
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
      <select
        className="input viewer__select"
        value={displayMode}
        onChange={(e) => setDisplayMode(e.target.value as DisplayMode)}
        aria-label="Режим отображения"
      >
        {DISPLAY_MODES.map((m) => (
          <option key={m} value={m}>
            {DISPLAY_MODE_LABELS[m]}
          </option>
        ))}
      </select>
      <p className="viewer__note muted">{DISPLAY_MODE_HINTS[displayMode]}</p>
      <div className="viewer__toggles">
        <Toggle label="Сетка" checked={grid} onChange={setGrid} hint="Клавиша G" />
        <Toggle label="Манекен 1,8 м" checked={mannequin} onChange={setMannequin} hint="Клавиша H — для проверки масштаба" />
        <Toggle label="Габариты" checked={dimensions} onChange={setDimensions} hint="Клавиша B — рамка с размерами в метрах" />
        <Toggle label="Тени" checked={shadows} onChange={setShadows} />
      </div>
    </Section>
  );
}

function PathRow({ label, path }: { label: string; path: string | null }) {
  return (
    <div className="path-row">
      <span className="path-row__label">{label}</span>
      {path ? (
        <>
          <span className="mono path-row__path" title={path}>
            {'\u200e' + path + '\u200e'}
          </span>
          <CopyButton text={path} />
        </>
      ) : (
        <span className="muted path-row__path">исходник не найден</span>
      )}
    </div>
  );
}
