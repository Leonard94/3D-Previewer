/** Метка разрешения текстуры по большей стороне: 512, 1K, 2K, 4K, 8K; нестандартное — как есть. */
export function textureSizeLabel(px: number): string {
  if (px >= 1024 && px % 1024 === 0) return `${px / 1024}K`;
  return String(px);
}

export const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;

/** Русское склонение по числу: plural(5, ['объект', 'объекта', 'объектов']). */
export function plural(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}
