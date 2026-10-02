// Форматирование чисел в сообщениях проверок.
import { plural } from '../../shared/format.ts';

export { plural };

const num = (n: number, digits: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: digits });

/** «12 см», «1,5 см», «3,25 м» — для расстояний до пола. */
export function formatDistance(m: number): string {
  const abs = Math.abs(m);
  return abs >= 1 ? `${num(abs, 2)} м` : `${num(abs * 100, abs < 0.1 ? 1 : 0)} см`;
}

export const formatMeters = (m: number) => `${num(m, m < 0.1 ? 4 : 2)} м`;

export const formatVec = (v: ArrayLike<number>) =>
  Array.from(v, (x) => num(x, 3)).join(' × ');

/** «3 мин», «2 ч 15 мин», «4 дн.» — насколько исходник новее экспорта. */
export function formatAge(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} мин`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} ч ${min % 60} мин` : `${h} ч`;
  return `${Math.round(h / 24)} дн.`;
}

/** «2 материала, 1 текстура» — для перечислений с числом. */
export const counted = (n: number, forms: [string, string, string]) => `${n} ${plural(n, forms)}`;
