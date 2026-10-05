import { migrateModelId } from './modelPathMigration.ts';
// Сохранённые сцены — в localStorage браузера, по ключу на сцену: правка одной сцены
// не перезаписывает остальные, даже если они открыты в других вкладках.
import { useSyncExternalStore } from 'react';
import type { Vec3 } from '../../../shared/types.ts';
import { useScene, type SceneItem } from './scene.ts';

const PREFIX = '3d-previewer.scene.';
/** Автосохранение — через столько после последнего изменения. */
const SAVE_DELAY_MS = 500;

export interface SavedCamera {
  position: Vec3;
  target: Vec3;
}

export interface SavedScene {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  items: SceneItem[];
  camera: SavedCamera | null;
}

const randomId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
export const newSceneId = randomId;

const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));

function parseItem(raw: unknown): SceneItem | null {
  const i = raw as Partial<SceneItem> | null;
  if (!i || typeof i.uid !== 'string' || typeof i.modelId !== 'string') return null;
  return {
    uid: i.uid,
    modelId: migrateModelId(i.modelId),
    position: isVec3(i.position) ? i.position : null,
    rotationY: Number.isFinite(i.rotationY) ? i.rotationY! : 0,
    hidden: i.hidden === true,
    ...(typeof i.cloneOf === 'string' && { cloneOf: i.cloneOf }),
  };
}

/** Разбирает запись из хранилища; битая запись — null, лишние и испорченные поля отбрасываются. */
function parseScene(id: string, raw: string | null): SavedScene | null {
  if (raw === null) return null;
  try {
    const s = JSON.parse(raw) as Partial<SavedScene>;
    if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null;
    const cam = s.camera;
    return {
      id,
      title: typeof s.title === 'string' && s.title.trim() ? s.title : 'Без названия',
      createdAt: Number(s.createdAt) || 0,
      updatedAt: Number(s.updatedAt) || 0,
      items: s.items.map(parseItem).filter((i): i is SceneItem => i !== null),
      camera: cam && isVec3(cam.position) && isVec3(cam.target) ? { position: cam.position, target: cam.target } : null,
    };
  } catch {
    return null;
  }
}

// localStorage может быть недоступен — тогда сцены просто не сохраняются.
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadScene(id: string): SavedScene | null {
  try {
    return parseScene(id, storage()?.getItem(PREFIX + id) ?? null);
  } catch {
    return null;
  }
}

function writeScene(scene: SavedScene): boolean {
  const { id, ...data } = scene;
  try {
    storage()?.setItem(PREFIX + id, JSON.stringify(data));
    notify();
    return true;
  } catch {
    return false;
  }
}

export function deleteScene(id: string): void {
  try {
    storage()?.removeItem(PREFIX + id);
  } catch {
    // нет доступа — не страшно
  }
  notify();
}

export function renameScene(id: string, title: string): void {
  const scene = loadScene(id);
  if (scene && title.trim()) writeScene({ ...scene, title: title.trim(), updatedAt: Date.now() });
}

/** Копия сцены рядом с исходной; возвращает id копии. */
export function duplicateScene(id: string): string | null {
  const scene = loadScene(id);
  if (!scene) return null;
  const now = Date.now();
  const copy = { ...scene, id: newSceneId(), title: `${scene.title} (копия)`, createdAt: now, updatedAt: now };
  return writeScene(copy) ? copy.id : null;
}

function readAll(): SavedScene[] {
  const store = storage();
  if (!store) return [];
  const scenes: SavedScene[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const scene = parseScene(key.slice(PREFIX.length), store.getItem(key));
      if (scene) scenes.push(scene);
    }
  } catch {
    // нет доступа — что успели прочитать
  }
  return scenes.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Название новой сцены: «Сцена N» со следующим свободным номером. */
export function nextSceneTitle(): string {
  let max = 0;
  for (const s of readAll()) {
    const m = /^Сцена (\d+)$/.exec(s.title);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `Сцена ${max + 1}`;
}

// ---------- список сцен для React ----------

const listeners = new Set<() => void>();
let cache: SavedScene[] | null = null;

function notify(): void {
  cache = null;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // Правки из других вкладок.
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(PREFIX)) notify();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

const getList = () => (cache ??= readAll());

/** Сохранённые сцены, последние изменённые — первыми. Обновляется и при правках в других вкладках. */
export function useSceneList(): SavedScene[] {
  return useSyncExternalStore(subscribe, getList);
}

// ---------- автосохранение открытой сцены ----------

/** То, что сохраняется: сравнивается строкой, чтобы не писать одно и то же. */
const contentOf = (s: { title: string; items: SceneItem[]; camera: SavedCamera | null }) =>
  JSON.stringify([s.title, s.items, s.camera]);

/**
 * Открывает сцену в сторе и сохраняет её изменения. Новая сцена появляется в хранилище,
 * когда в ней есть что хранить — модель или своё название; от одного поворота камеры пустая
 * сцена не сохраняется. Возвращает остановку (она же дописывает несохранённое).
 */
export function startAutosave(id: string): () => void {
  const saved = loadScene(id);
  const title = saved?.title ?? nextSceneTitle();
  const createdAt = saved?.createdAt ?? Date.now();
  useScene.getState().open(id, { title, items: saved?.items ?? [], camera: saved?.camera ?? null });

  let exists = saved !== null;
  let last = contentOf(useScene.getState());
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const s = useScene.getState();
    if (s.sceneId !== id) return;
    const content = contentOf(s);
    if (content === last) return;
    if (!exists && s.items.length === 0 && s.title === title) return;
    if (writeScene({ id, title: s.title, createdAt, updatedAt: Date.now(), items: s.items, camera: s.camera })) {
      last = content;
      exists = true;
    }
  };

  const unsubscribe = useScene.subscribe((s, prev) => {
    if (s.items === prev.items && s.title === prev.title && s.camera === prev.camera) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  });

  // Та же сцена изменилась в другой вкладке — берём её версию, чтобы потом не затереть.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PREFIX + id) return;
    const external = parseScene(id, e.newValue);
    if (!external) return;
    exists = true;
    last = contentOf(external);
    if (timer) clearTimeout(timer);
    timer = null;
    useScene.getState().applyExternal(external);
  };

  window.addEventListener('storage', onStorage);
  window.addEventListener('pagehide', flush);
  return () => {
    flush();
    unsubscribe();
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('pagehide', flush);
  };
}
