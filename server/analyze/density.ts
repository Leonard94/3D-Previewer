import type { TexelDensity } from '../../shared/types.ts';

// Плотность текселей копится в логарифмической гистограмме: память не зависит от числа
// треугольников, а точность 1/24 октавы (~3 %) с запасом хватает для px/м.
const MIN_LOG2 = -8; // ~0,004 px/м
const MAX_LOG2 = 20; // ~1 000 000 px/м
const BINS_PER_OCTAVE = 24;
const BIN_COUNT = (MAX_LOG2 - MIN_LOG2) * BINS_PER_OCTAVE;

export class DensityHistogram {
  private readonly bins = new Float64Array(BIN_COUNT);
  private total = 0;

  /** d — плотность в px/м, weight — площадь треугольника в мировых координатах. */
  add(d: number, weight: number): void {
    if (!(d > 0) || !(weight > 0) || !Number.isFinite(d)) return;
    let b = Math.floor((Math.log2(d) - MIN_LOG2) * BINS_PER_OCTAVE);
    if (b < 0) b = 0;
    else if (b >= BIN_COUNT) b = BIN_COUNT - 1;
    this.bins[b]! += weight;
    this.total += weight;
  }

  merge(other: DensityHistogram): void {
    for (let i = 0; i < BIN_COUNT; i++) this.bins[i]! += other.bins[i]!;
    this.total += other.total;
  }

  get empty(): boolean {
    return this.total <= 0;
  }

  /** Взвешенный квантиль с линейной интерполяцией внутри корзины (в лог-шкале). */
  quantile(q: number): number {
    const target = q * this.total;
    let acc = 0;
    for (let i = 0; i < BIN_COUNT; i++) {
      const w = this.bins[i]!;
      if (w > 0 && acc + w >= target) {
        const t = (target - acc) / w;
        return 2 ** (MIN_LOG2 + (i + t) / BINS_PER_OCTAVE);
      }
      acc += w;
    }
    return 2 ** MAX_LOG2;
  }

  result(): TexelDensity | null {
    if (this.empty) return null;
    return { median: this.quantile(0.5), p10: this.quantile(0.1), p90: this.quantile(0.9) };
  }
}
