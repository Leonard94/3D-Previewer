// Сцена из нескольких моделей. Каждая версия .glb грузится один раз и остаётся нетронутым
// образцом; на сцену ставятся его копии (clone) с общими геометрией, материалами и текстурами.
// Освобождается образец, когда его не использует ни одна копия.
import * as THREE from 'three';
import type { ModelSummary, Vec3 } from '../../../shared/types.ts';
import { modelFileUrl } from '../api/client.ts';
import type { ItemStatus, SceneItem } from '../store/scene.ts';
import { boundsFromBox, computeBounds, type ModelBounds } from './bounds.ts';
import { applyDisplayMode, disposeDisplayModes } from './displayModes.ts';
import { disposeHighlights } from './highlight.ts';
import { disposeObject, loadGltf } from './loader.ts';
import { collectMeshes } from './objects.ts';
import { prepareWetness } from './wetness.ts';
import { HIDDEN_SURFACE_LAYER, removeWireframe } from './wireframe.ts';

/** Зазор между новой моделью и уже стоящими, м. */
const PLACE_GAP = 0.3;

interface Asset {
  status: 'loading' | 'ready' | 'error';
  template: THREE.Object3D | null;
  meshes: THREE.Mesh[];
  /** AABB в координатах модели. */
  box: THREE.Box3;
  error: string | null;
}

export interface SceneInstance {
  uid: string;
  modelId: string;
  /** Версия модели (id + хеш .glb). */
  key: string;
  root: THREE.Object3D;
  meshes: THREE.Mesh[];
  /** AABB в координатах модели — габариты сцены считаются без перебора вершин. */
  box: THREE.Box3;
}

export interface StageSnapshot {
  instances: SceneInstance[];
  /** Габариты видимых моделей; пустая сцена — условный куб 1 м. */
  bounds: ModelBounds;
  status: Record<string, ItemStatus>;
}

export interface StageEvents {
  onChange: (snapshot: StageSnapshot) => void;
  /** Новые модели встали на места — позиции надо записать в стор. */
  onPlaced: (positions: [string, Vec3][], total: number) => void;
  /** Модели заменены переэкспортированными версиями (id моделей). */
  onReloaded: (modelIds: string[]) => void;
}

const assetKey = (m: ModelSummary) => `${m.id}\n${m.hash}`;

/** AABB копии в координатах сцены (без поворотного стола). */
export function instanceBox(inst: SceneInstance): THREE.Box3 {
  return inst.box.clone().applyMatrix4(inst.root.matrix);
}

export const EMPTY_BOUNDS = computeBounds(new THREE.Group());

export class SceneStage {
  /** Корень сцены: копии моделей добавляются сюда. */
  readonly root = new THREE.Group();
  private readonly assets = new Map<string, Asset>();
  private readonly instances = new Map<string, SceneInstance>();
  private items: SceneItem[] = [];
  /** Позиции, выданные новым моделям, пока они не вернулись из стора. */
  private readonly placements = new Map<string, Vec3>();
  private models: Record<string, ModelSummary> | null = null;
  /** Модель, которую сейчас тянут гизмо: её положение не берётся из стора до отпускания. */
  dragging: string | null = null;
  private disposed = false;

  constructor(
    private readonly gl: THREE.WebGLRenderer,
    private readonly events: StageEvents,
  ) {}

  /** Приводит сцену к списку моделей. models = null — каталог ещё не загружен. */
  sync(items: SceneItem[], models: Record<string, ModelSummary> | null): void {
    this.items = items;
    this.models = models;
    this.update();
  }

  dispose(): void {
    this.disposed = true;
    for (const uid of [...this.instances.keys()]) this.release(uid);
    for (const asset of this.assets.values()) disposeAsset(asset);
    this.assets.clear();
  }

  private update(): void {
    if (this.disposed) return;
    const status: Record<string, ItemStatus> = {};
    const placed: [string, Vec3][] = [];
    const reloaded = new Set<string>();

    const uids = new Set(this.items.map((i) => i.uid));
    for (const uid of [...this.instances.keys()]) if (!uids.has(uid)) this.release(uid);
    for (const uid of [...this.placements.keys()]) if (!uids.has(uid)) this.placements.delete(uid);

    for (const item of this.items) {
      let inst = this.instances.get(item.uid);
      const summary = this.models?.[item.modelId];
      if (!summary) {
        // Каталог ещё грузится — ждём. Файла нет — на сцене остаётся то, что уже загружено.
        status[item.uid] = this.models ? { state: 'missing' } : { state: 'loading' };
      } else {
        const key = assetKey(summary);
        const asset = inst?.key === key ? null : this.asset(key, summary);
        if (asset?.status === 'ready') {
          if (inst) {
            this.release(item.uid);
            reloaded.add(item.modelId);
          }
          inst = this.createInstance(item, key, asset);
        }
        // Пока новая версия грузится или не открылась, старая остаётся на сцене.
        status[item.uid] =
          asset?.status === 'error'
            ? { state: 'error', message: asset.error ?? 'Модель не открывается' }
            : inst
              ? { state: 'ready' }
              : { state: 'loading' };
      }
      if (!inst) continue;
      if (inst.uid === this.dragging) {
        inst.root.visible = !item.hidden;
        continue;
      }

      if (item.position) this.placements.delete(item.uid);
      let position = item.position ?? this.placements.get(item.uid);
      if (!position) {
        position = this.placeNew(inst, item);
        this.placements.set(item.uid, position);
        placed.push([item.uid, position]);
      }
      inst.root.position.fromArray(position);
      inst.root.rotation.set(0, item.rotationY, 0);
      inst.root.visible = !item.hidden;
      inst.root.updateMatrix();
    }

    this.disposeUnused();

    const instances = [...this.instances.values()];
    this.events.onChange({ instances, bounds: sceneBounds(instances), status });
    if (placed.length > 0) this.events.onPlaced(placed, instances.length);
    if (reloaded.size > 0) this.events.onReloaded([...reloaded]);
  }

  /** Образец модели: из кеша или начинает загрузку. */
  private asset(key: string, summary: ModelSummary): Asset {
    const existing = this.assets.get(key);
    if (existing) return existing;
    const asset: Asset = { status: 'loading', template: null, meshes: [], box: new THREE.Box3(), error: null };
    this.assets.set(key, asset);
    loadGltf(this.gl, modelFileUrl(summary.id, summary.hash)).then(
      (gltf) => {
        const template = gltf.scene;
        const meshes = collectMeshes(template);
        if (this.disposed || this.assets.get(key) !== asset) {
          disposeObject(template);
          return;
        }
        for (const m of meshes) {
          m.castShadow = true;
          m.receiveShadow = true;
        }
        prepareWetness(meshes);
        Object.assign(asset, { status: 'ready', template, meshes, box: computeBounds(template).box });
        this.update();
      },
      (err: unknown) => {
        if (this.disposed || this.assets.get(key) !== asset) return;
        console.error(err);
        Object.assign(asset, { status: 'error', error: err instanceof Error ? err.message : String(err) });
        this.update();
      },
    );
    return asset;
  }

  private createInstance(item: SceneItem, key: string, asset: Asset): SceneInstance {
    // Образец не бывает на сцене и не меняется, поэтому clone копирует чистую модель.
    const root = asset.template!.clone();
    const inst: SceneInstance = { uid: item.uid, modelId: item.modelId, key, root, meshes: collectMeshes(root), box: asset.box };
    this.root.add(root);
    this.instances.set(item.uid, inst);
    return inst;
  }

  /** Убирает копию со сцены вместе со всем, что к ней добавлял вьювер. Общие ресурсы не трогает. */
  private release(uid: string): void {
    const inst = this.instances.get(uid);
    if (!inst) return;
    applyDisplayMode(inst.meshes, 'normal');
    disposeHighlights(inst.meshes);
    removeWireframe(inst.root);
    this.root.remove(inst.root);
    this.instances.delete(uid);
  }

  /** Освобождает образцы, которые больше не нужны ни одной модели сцены. */
  private disposeUnused(): void {
    const used = new Set<string>();
    for (const inst of this.instances.values()) used.add(inst.key);
    for (const item of this.items) {
      const summary = this.models?.[item.modelId];
      if (summary) used.add(assetKey(summary));
    }
    for (const [key, asset] of this.assets) {
      if (used.has(key)) continue;
      disposeAsset(asset);
      this.assets.delete(key);
    }
  }

  /**
   * Место для новой модели. Дубль — справа от оригинала, с тем же поворотом и на той же высоте.
   * Остальные — справа от всей сцены (по X), с зазором, центр по Z — как у сцены; высота — как
   * в файле: модели и так стоят на полу. Первая модель — в начале координат.
   */
  private placeNew(inst: SceneInstance, item: SceneItem): Vec3 {
    const original = item.cloneOf ? this.instances.get(item.cloneOf) : undefined;
    if (original) {
      const width = instanceBox(original).getSize(new THREE.Vector3()).x;
      const p = original.root.position;
      return [p.x + width + PLACE_GAP, p.y, p.z];
    }
    const others = new THREE.Box3();
    for (const other of this.instances.values()) {
      if (other !== inst) others.union(instanceBox(other));
    }
    if (others.isEmpty()) return [0, 0, 0];
    const { box } = inst;
    const x = others.max.x + PLACE_GAP - box.min.x;
    const z = (others.min.z + others.max.z) / 2 - (box.min.z + box.max.z) / 2;
    return [x, 0, z];
  }

  /** uid модели, которой принадлежит объект (результат raycast), или null. */
  uidOf(object: THREE.Object3D): string | null {
    let o: THREE.Object3D | null = object;
    while (o && o.parent !== this.root) o = o.parent;
    if (!o) return null;
    for (const inst of this.instances.values()) if (inst.root === o) return inst.uid;
    return null;
  }

  /**
   * Высота поверхности под моделью в её текущем положении: лучи вниз из центра и углов
   * её «следа» по другим видимым моделям; берётся самая высокая точка. Лучи стартуют
   * с высоты верха модели — на то, что выше неё (крона фонаря над урной), она не запрыгнет.
   * Ничего нет — пол (0).
   */
  surfaceY(inst: SceneInstance): number {
    const targets = [...this.instances.values()].filter((i) => i !== inst && i.root.visible).map((i) => i.root);
    if (targets.length === 0) return 0;
    inst.root.updateMatrix();
    this.root.updateWorldMatrix(true, true);
    const { min, max } = inst.box;
    const cx = (min.x + max.x) / 2;
    const cz = (min.z + max.z) / 2;
    const hx = ((max.x - min.x) / 2) * FOOTPRINT_INSET;
    const hz = ((max.z - min.z) / 2) * FOOTPRINT_INSET;
    const toWorld = new THREE.Matrix4().multiplyMatrices(this.root.matrixWorld, inst.root.matrix);
    const origin = new THREE.Vector3();
    let best = -Infinity;
    for (const [dx, dz] of FOOTPRINT_SAMPLES) {
      origin.set(cx + dx * hx, max.y, cz + dz * hz).applyMatrix4(toWorld);
      raycaster.set(origin, DOWN);
      const hit = raycaster.intersectObjects(targets, true)[0];
      if (hit && hit.point.y > best) best = hit.point.y;
    }
    return best === -Infinity ? 0 : Math.max(best, 0);
  }
}

/** Доля полуразмера, на которой берутся углы «следа»: край модели может свисать. */
const FOOTPRINT_INSET = 0.8;
const FOOTPRINT_SAMPLES: [number, number][] = [
  [0, 0],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
const DOWN = new THREE.Vector3(0, -1, 0);
const raycaster = new THREE.Raycaster();
// В режиме «Только каркас» поверхности на скрытом слое — опора всё равно нужна.
raycaster.layers.enable(HIDDEN_SURFACE_LAYER);

function disposeAsset(asset: Asset): void {
  if (!asset.template) return;
  disposeDisplayModes(asset.meshes);
  disposeObject(asset.template);
}

function sceneBounds(instances: SceneInstance[]): ModelBounds {
  const box = new THREE.Box3();
  for (const inst of instances) if (inst.root.visible) box.union(instanceBox(inst));
  return box.isEmpty() ? EMPTY_BOUNDS : boundsFromBox(box);
}
