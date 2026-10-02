// Все константы пресетов света — в одном месте, чтобы их было легко подкручивать.
// Углы: азимут от +Z (фронт glTF) к +X, высота — над горизонтом, в градусах.
// Расстояния и размеры теней считаются от размера модели автоматически (Lighting.tsx).
import type { GridStyle } from './Grid.tsx';

export type LightPresetId = 'day' | 'night' | 'neutral' | 'studio';

export const LIGHT_PRESET_ORDER: LightPresetId[] = ['day', 'night', 'neutral', 'studio'];

export interface DirectionalSpec {
  kind: 'directional';
  name: string;
  kelvin: number;
  intensity: number;
  azimuth: number;
  elevation: number;
  castShadow?: boolean;
  /** Взять азимут и высоту солнца из HDRI (самая яркая точка неба). */
  followHdriSun?: boolean;
}

export interface SpotSpec {
  kind: 'spot';
  name: string;
  kelvin: number;
  /** Освещённость в центре модели: итоговая intensity = это × расстояние² (decay = 2). */
  intensity: number;
  azimuth: number;
  elevation: number;
  /** Расстояние от центра модели в радиусах её описанной сферы. */
  distance: number;
  penumbra: number;
  castShadow?: boolean;
}

export type LightSpec = DirectionalSpec | SpotSpec;

export type EnvironmentSpec =
  | { type: 'hdri'; url: string; intensity: number }
  | { type: 'room'; intensity: number };

export interface LightPreset {
  id: LightPresetId;
  label: string;
  /** Для чего пресет — подпись в панели. */
  purpose: string;
  environment: EnvironmentSpec;
  background: {
    /** Однотонный фон (и запасной, если HDRI нет). */
    color: string;
    /** Можно показать HDRI фоном (переключатель «Окружение фоном»). */
    hdri?: { blurriness: number; intensity: number };
  };
  lights: LightSpec[];
  exposure: number;
  shadow: { opacity: number; radius: number };
  grid: GridStyle;
  /** Цвет линий каркаса: тёмный на светлом фоне, светлый на тёмном. */
  wireframeColor: string;
}

export const LIGHT_PRESETS: Record<LightPresetId, LightPreset> = {
  day: {
    id: 'day',
    label: 'День',
    purpose: 'Как модель выглядит на улице днём',
    environment: { type: 'hdri', url: '/hdri/day.hdr', intensity: 1 },
    background: { color: '#a9b4bd', hdri: { blurriness: 0.5, intensity: 1 } },
    lights: [
      {
        kind: 'directional',
        name: 'Солнце',
        kelvin: 5500,
        intensity: 2.4,
        azimuth: 40,
        elevation: 45,
        castShadow: true,
        followHdriSun: true,
      },
    ],
    exposure: 1,
    shadow: { opacity: 0.5, radius: 3 },
    grid: { minorColor: '#2a302c', majorColor: '#5a4a2a', minorOpacity: 0.16, majorOpacity: 0.32 },
    wireframeColor: '#101211',
  },

  night: {
    id: 'night',
    label: 'Ночь',
    purpose: 'Как модель выглядит на улице ночью, под фонарём',
    environment: { type: 'hdri', url: '/hdri/night.hdr', intensity: 0.3 },
    background: { color: '#0d1322', hdri: { blurriness: 0.5, intensity: 0.12 } },
    lights: [
      { kind: 'directional', name: 'Луна', kelvin: 8000, intensity: 0.45, azimuth: -55, elevation: 50, castShadow: true },
      {
        kind: 'spot',
        name: 'Фонарь',
        kelvin: 3000,
        intensity: 3.5,
        azimuth: 20,
        elevation: 62,
        distance: 2.6,
        penumbra: 0.65,
        castShadow: true,
      },
    ],
    exposure: 1,
    shadow: { opacity: 0.55, radius: 4 },
    grid: { minorColor: '#8ea0c4', majorColor: '#d9c7a0', minorOpacity: 0.1, majorOpacity: 0.25 },
    wireframeColor: '#dfe6f2',
  },

  neutral: {
    id: 'neutral',
    label: 'Нейтральный',
    purpose: 'Честная оценка цвета и материалов',
    environment: { type: 'room', intensity: 1 },
    background: { color: '#5e615e' },
    lights: [
      { kind: 'directional', name: 'Свет', kelvin: 6500, intensity: 1.3, azimuth: 35, elevation: 55, castShadow: true },
    ],
    exposure: 1,
    shadow: { opacity: 0.22, radius: 8 },
    grid: { minorColor: '#ffffff', majorColor: '#d9c7a0', minorOpacity: 0.2, majorOpacity: 0.5 },
    wireframeColor: '#121413',
  },

  studio: {
    id: 'studio',
    label: 'Студийный',
    purpose: 'Красивая подача модели',
    environment: { type: 'hdri', url: '/hdri/studio.hdr', intensity: 0.35 },
    background: { color: '#1f2120' },
    lights: [
      { kind: 'directional', name: 'Ключевой', kelvin: 4500, intensity: 2.6, azimuth: 50, elevation: 42, castShadow: true },
      { kind: 'directional', name: 'Заполняющий', kelvin: 7500, intensity: 0.55, azimuth: -70, elevation: 18 },
      { kind: 'directional', name: 'Контровой', kelvin: 6000, intensity: 2.2, azimuth: 180, elevation: 38 },
    ],
    exposure: 1,
    shadow: { opacity: 0.4, radius: 5 },
    grid: { minorColor: '#ffffff', majorColor: '#d9c7a0', minorOpacity: 0.07, majorOpacity: 0.22 },
    wireframeColor: '#e8e6e1',
  },
};

/** Пределы высоты солнца, взятого из HDRI: слишком низкое даёт бесконечные тени. */
export const HDRI_SUN_ELEVATION_RANGE: [number, number] = [30, 60];
