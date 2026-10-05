import { create } from 'zustand';
import type { Vec3 } from '../../../shared/types.ts';
import type { SavedCamera, SavedScene } from './sceneLibrary.ts';

/** Модель в сцене. Одна и та же модель может стоять несколько раз. */
export interface SceneItem {
  uid: string;
  modelId: string;
  /** null — ещё не расставлена: встанет рядом с остальными, когда загрузится. */
  position: Vec3 | null;
  /** Поворот вокруг вертикали, рад. */
  rotationY: number;
  hidden: boolean;
  /** Дубль: встанет рядом с этой моделью, а не справа от всей сцены. */
  cloneOf?: string;
}

export type ItemStatus =
  | { state: 'loading' }
  | { state: 'ready' }
  | { state: 'error'; message: string }
  /** .glb удалён или переименован: на сцене остаётся последняя загруженная версия. */
  | { state: 'missing' };

export type GizmoMode = 'translate' | 'rotate';

interface SceneState {
  /** Открытая сцена; сохраняет её sceneLibrary. */
  sceneId: string | null;
  title: string;
  items: SceneItem[];
  /** Последний ракурс камеры — сохраняется со сценой и восстанавливается при открытии. */
  camera: SavedCamera | null;
  /** Состояние загрузки по uid — его пишет сцена three.js. */
  status: Record<string, ItemStatus>;
  /** Выделенная модель — у неё гизмо. */
  selected: string | null;
  gizmo: GizmoMode;
  /** Положение модели, пока её тянут гизмо (в стор оно уходит, когда кнопку отпустили). */
  live: { uid: string; position: Vec3; rotationY: number } | null;
  /** Запрос «Опустить на поверхность»; seq растёт, чтобы повтор тоже срабатывал. */
  drop: { uid: string; seq: number } | null;

  open: (id: string, scene: Pick<SavedScene, 'title' | 'items' | 'camera'>) => void;
  /** Та же сцена изменилась в другой вкладке. */
  applyExternal: (scene: SavedScene) => void;
  rename: (title: string) => void;
  setCamera: (camera: SavedCamera) => void;
  add: (modelId: string) => string;
  remove: (uid: string) => void;
  duplicate: (uid: string) => void;
  toggleHidden: (uid: string) => void;
  select: (uid: string | null) => void;
  setGizmo: (mode: GizmoMode) => void;
  setLive: (live: SceneState['live']) => void;
  dropToSurface: (uid: string) => void;
  setTransform: (uid: string, position: Vec3, rotationY: number) => void;
  setPositions: (positions: [string, Vec3][]) => void;
  setStatus: (status: Record<string, ItemStatus>) => void;
}

// uid уникален в пределах сцены, в том числе среди сохранённых раньше моделей.
const newUid = () => 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const sameVec = (a: Vec3, b: Vec3) => a.every((v, i) => Math.abs(v - b[i]!) < 1e-4);

export const useScene = create<SceneState>((set, get) => ({
  sceneId: null,
  title: '',
  items: [],
  camera: null,
  status: {},
  selected: null,
  gizmo: 'translate',
  live: null,
  drop: null,

  open: (sceneId, { title, items, camera }) =>
    set({ sceneId, title, items, camera, status: {}, selected: null, gizmo: 'translate', live: null, drop: null }),
  applyExternal: ({ title, items, camera }) => {
    const { selected } = get();
    set({ title, items, camera, selected: items.some((i) => i.uid === selected) ? selected : null, live: null });
  },
  rename: (title) => {
    if (title.trim()) set({ title: title.trim() });
  },
  setCamera: (camera) => {
    const prev = get().camera;
    if (prev && sameVec(prev.position, camera.position) && sameVec(prev.target, camera.target)) return;
    set({ camera });
  },
  add: (modelId) => {
    const uid = newUid();
    set({ items: [...get().items, { uid, modelId, position: null, rotationY: 0, hidden: false }] });
    return uid;
  },
  remove: (uid) => {
    const { items, selected } = get();
    set({ items: items.filter((i) => i.uid !== uid), selected: selected === uid ? null : selected });
  },
  duplicate: (uid) => {
    const src = get().items.find((i) => i.uid === uid);
    if (!src) return;
    const copy: SceneItem = { uid: newUid(), modelId: src.modelId, position: null, rotationY: src.rotationY, hidden: false, cloneOf: uid };
    set({ items: [...get().items, copy], selected: copy.uid });
  },
  // Скрытую модель нельзя двигать — выделение снимается.
  toggleHidden: (uid) => {
    const { items, selected } = get();
    const item = items.find((i) => i.uid === uid);
    set({
      items: items.map((i) => (i.uid === uid ? { ...i, hidden: !i.hidden } : i)),
      selected: selected === uid && item && !item.hidden ? null : selected,
    });
  },
  select: (selected) => set({ selected }),
  setGizmo: (gizmo) => set({ gizmo }),
  setLive: (live) => set({ live }),
  dropToSurface: (uid) => set({ drop: { uid, seq: (get().drop?.seq ?? 0) + 1 } }),
  setTransform: (uid, position, rotationY) =>
    set({ items: get().items.map((i) => (i.uid === uid ? { ...i, position, rotationY } : i)) }),
  setPositions: (positions) => {
    const byUid = new Map(positions);
    set({ items: get().items.map((i) => (byUid.has(i.uid) ? { ...i, position: byUid.get(i.uid)! } : i)) });
  },
  setStatus: (status) => set({ status }),
}));
