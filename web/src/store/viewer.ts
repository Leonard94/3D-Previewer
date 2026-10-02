import type * as THREE from 'three';
import { create } from 'zustand';
import type { DisplayMode } from '../three/displayModes.ts';
import { LIGHT_PRESET_ORDER, type LightPresetId } from '../three/lightPresets.ts';
import type { ViewName } from '../three/views.ts';
import { WIREFRAME_MODES, type WireframeMode } from '../three/wireframe.ts';
import { readSetting, writeSetting } from './persist.ts';

/** Команда для камеры; seq растёт с каждой командой, чтобы повтор той же команды тоже срабатывал. */
export type CameraCommand =
  | { kind: 'view'; view: ViewName; instant?: boolean; seq: number }
  | { kind: 'fit'; seq: number }
  | { kind: 'focus'; point: [number, number, number]; seq: number }
  /** Вписать в кадр объект модели (по имени узла) в текущем ракурсе. */
  | { kind: 'object'; name: string; seq: number };

type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never;

interface ViewerState {
  /** Последний выбранный вид; null — пользователь повернул камеру сам. */
  activeView: ViewName | null;
  command: CameraCommand | null;
  grid: boolean;
  /** Влажность, 0–100 %. При открытии модели — 0. */
  wetness: number;
  wireframe: WireframeMode;
  rotate: boolean;
  /** Окно «Горячие клавиши». */
  hotkeysOpen: boolean;
  lightPreset: LightPresetId;
  /** HDRI фоном для «День» и «Ночь»; иначе однотонный фон. */
  envBackground: boolean;
  /** URL HDRI, которые не удалось загрузить (не скачаны). */
  missingHdri: string[];
  /** Режим отображения — временная подмена материалов. Не запоминается: новая вкладка — «Обычный». */
  displayMode: DisplayMode;
  /** Вспомогательные элементы: запоминаются для всех моделей. */
  mannequin: boolean;
  dimensions: boolean;
  shadows: boolean;

  // Объекты модели — по именам узлов: так они переживают переэкспорт (горячую перезагрузку).
  hidden: string[];
  /** Показан только этот объект. */
  isolated: string | null;
  /** Выделен обводкой. */
  selected: string | null;
  /** Подсвечен при наведении в списке. */
  hovered: string | null;

  /** Растёт с каждым запросом скриншота. */
  screenshotSeq: number;
  toast: { text: string; seq: number } | null;

  setView: (view: ViewName, opts?: { instant?: boolean }) => void;
  fit: () => void;
  focusPoint: (p: THREE.Vector3) => void;
  clearActiveView: () => void;
  setGrid: (on: boolean) => void;
  setWetness: (percent: number) => void;
  setWireframe: (mode: WireframeMode) => void;
  /** W: нет → поверх → только каркас → нет. */
  cycleWireframe: () => void;
  setRotate: (on: boolean) => void;
  setHotkeysOpen: (open: boolean) => void;
  setLightPreset: (id: LightPresetId) => void;
  nextLightPreset: () => void;
  setEnvBackground: (on: boolean) => void;
  setHdriMissing: (url: string, missing: boolean) => void;
  setDisplayMode: (mode: DisplayMode) => void;
  setMannequin: (on: boolean) => void;
  setDimensions: (on: boolean) => void;
  setShadows: (on: boolean) => void;
  toggleHidden: (name: string) => void;
  toggleIsolated: (name: string) => void;
  /** Выделить объект; focus — ещё и вписать его в кадр. */
  selectObject: (name: string | null, opts?: { focus?: boolean }) => void;
  setHovered: (name: string | null) => void;
  /** Оставить только объекты, которые есть в модели (после переэкспорта). */
  keepObjects: (names: Set<string>) => void;
  requestScreenshot: () => void;
  showToast: (text: string) => void;
}

const isPresetId = (v: unknown): v is LightPresetId => LIGHT_PRESET_ORDER.includes(v as LightPresetId);

let seq = 0;
const cmd = (c: DistributiveOmit<CameraCommand, 'seq'>): CameraCommand => ({ ...c, seq: ++seq }) as CameraCommand;

export const useViewer = create<ViewerState>((set, get) => ({
  activeView: 'general',
  command: null,
  grid: readSetting('grid', true),
  wetness: 0,
  wireframe: 'off',
  rotate: false,
  hotkeysOpen: false,
  lightPreset: readSetting<LightPresetId>('lightPreset', 'day', isPresetId),
  envBackground: readSetting('envBackground', true),
  missingHdri: [],
  displayMode: 'normal',
  mannequin: readSetting('mannequin', false),
  dimensions: readSetting('dimensions', false),
  shadows: readSetting('shadows', true),
  hidden: [],
  isolated: null,
  selected: null,
  hovered: null,
  screenshotSeq: 0,
  toast: null,

  setView: (view, opts) => set({ activeView: view, command: cmd({ kind: 'view', view, instant: opts?.instant }) }),
  fit: () => set({ command: cmd({ kind: 'fit' }) }),
  focusPoint: (p) => set({ activeView: null, command: cmd({ kind: 'focus', point: [p.x, p.y, p.z] }) }),
  clearActiveView: () => set({ activeView: null }),
  setGrid: (grid) => {
    writeSetting('grid', grid);
    set({ grid });
  },
  setWetness: (wetness) => set({ wetness: Math.min(Math.max(Math.round(wetness), 0), 100) }),
  setWireframe: (wireframe) => set({ wireframe }),
  cycleWireframe: () => {
    const i = WIREFRAME_MODES.indexOf(get().wireframe);
    set({ wireframe: WIREFRAME_MODES[(i + 1) % WIREFRAME_MODES.length]! });
  },
  setRotate: (rotate) => set({ rotate }),
  setHotkeysOpen: (hotkeysOpen) => set({ hotkeysOpen }),
  setLightPreset: (lightPreset) => {
    writeSetting('lightPreset', lightPreset);
    set({ lightPreset });
  },
  nextLightPreset: () => {
    const i = LIGHT_PRESET_ORDER.indexOf(get().lightPreset);
    get().setLightPreset(LIGHT_PRESET_ORDER[(i + 1) % LIGHT_PRESET_ORDER.length]!);
  },
  setEnvBackground: (envBackground) => {
    writeSetting('envBackground', envBackground);
    set({ envBackground });
  },
  setHdriMissing: (url, missing) => {
    const list = get().missingHdri.filter((u) => u !== url);
    set({ missingHdri: missing ? [...list, url] : list });
  },
  setDisplayMode: (displayMode) => set({ displayMode }),
  setMannequin: (mannequin) => {
    writeSetting('mannequin', mannequin);
    set({ mannequin });
  },
  setDimensions: (dimensions) => {
    writeSetting('dimensions', dimensions);
    set({ dimensions });
  },
  setShadows: (shadows) => {
    writeSetting('shadows', shadows);
    set({ shadows });
  },
  toggleHidden: (name) => {
    const { hidden, isolated } = get();
    // Скрыть изолированный объект — значит снять изоляцию и скрыть его.
    if (isolated === name) return set({ isolated: null, hidden: [...hidden, name] });
    set({ hidden: hidden.includes(name) ? hidden.filter((n) => n !== name) : [...hidden, name] });
  },
  toggleIsolated: (name) => {
    const isolated = get().isolated === name ? null : name;
    set({ isolated, hidden: isolated ? get().hidden.filter((n) => n !== name) : get().hidden });
  },
  selectObject: (name, opts) =>
    set(name && opts?.focus ? { selected: name, activeView: null, command: cmd({ kind: 'object', name }) } : { selected: name }),
  setHovered: (hovered) => set({ hovered }),
  keepObjects: (names) => {
    const { hidden, isolated, selected, hovered } = get();
    const keep = (n: string | null) => (n !== null && names.has(n) ? n : null);
    set({ hidden: hidden.filter((n) => names.has(n)), isolated: keep(isolated), selected: keep(selected), hovered: keep(hovered) });
  },
  requestScreenshot: () => set({ screenshotSeq: get().screenshotSeq + 1 }),
  showToast: (text) => set({ toast: { text, seq: (get().toast?.seq ?? 0) + 1 } }),
}));
