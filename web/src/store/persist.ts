// Настройки вьювера, общие для всех моделей. localStorage может быть недоступен — тогда просто не запоминаем.
const PREFIX = '3d-previewer.';

export function readSetting<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw) as unknown;
    if (validate ? validate(value) : typeof value === typeof fallback) return value as T;
  } catch {
    // нет доступа или мусор в хранилище
  }
  return fallback;
}

export function writeSetting(key: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // нет доступа — не страшно
  }
}
