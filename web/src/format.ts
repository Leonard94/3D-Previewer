const intFmt = new Intl.NumberFormat('ru-RU');

export const formatInt = (n: number) => intFmt.format(n);

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  const units = ['КБ', 'МБ', 'ГБ'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString('ru-RU', { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}

export { plural, textureSizeLabel } from '../../shared/format.ts';

const dateFmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
export const formatDate = (ms: number) => dateFmt.format(ms);

/** Метры с двумя знаками: 1,25 м. */
export const formatMeters = (m: number) => `${m.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} м`;

/** Единицы длины для габаритов. */
export type LengthUnit = 'm' | 'cm';

export const LENGTH_UNIT_LABELS: Record<LengthUnit, string> = { m: 'м', cm: 'см' };

/** Длина без подписи единиц: метры — два знака (1,25), сантиметры — до одного (125 или 12,5). */
export const formatLengthValue = (m: number, unit: LengthUnit) =>
  unit === 'm'
    ? m.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : (m * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 });

export const formatLength = (m: number, unit: LengthUnit) => `${formatLengthValue(m, unit)} ${LENGTH_UNIT_LABELS[unit]}`;

/** Плотность текселей в px/м — целое, крупные значения с разделителями. */
export const formatDensity = (d: number) => `${formatInt(Math.round(d))} px/м`;

/** Сантиметры для подписей «парит на N см». */
export const formatCm = (m: number) => `${Math.abs(m * 100).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} см`;
