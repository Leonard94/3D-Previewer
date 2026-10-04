// Оси Blender в интерфейсе сцены. Сцена хранится как в glTF (Y вверх), а показывается как в
// Blender (Z вверх): X = x, Y = −z, Z = y. Поворот вокруг вертикали — тот же угол.
import type { Vec3 } from '../../../shared/types.ts';

export const toBlender = ([x, y, z]: Vec3): Vec3 => [x, -z, y];
export const fromBlender = ([x, y, z]: Vec3): Vec3 => [x, z, -y];

/** Цвета осей Blender: X, Y, Z. */
export const AXIS_COLORS = ['#e8615a', '#8bc34a', '#5b9bf0'] as const;
