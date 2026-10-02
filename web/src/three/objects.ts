// Объекты модели: узел glTF (по индексу из анализа) → объект three и его собственные меши.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { applyDisplayMode, disposeDisplayModes } from './displayModes.ts';
import { disposeObject } from './loader.ts';
import { disposeHighlights } from './highlight.ts';
import { disposeWireframe } from './wireframe.ts';

export interface ModelObject {
  nodeIndex: number;
  node: THREE.Object3D;
  /**
   * Меши самого узла, без дочерних узлов. Узел с одним примитивом — сам Mesh;
   * с несколькими — группа, где меши-примитивы лежат рядом с дочерними узлами.
   */
  meshes: THREE.Mesh[];
}

type Associations = Map<object, { nodes?: number; meshes?: number; primitives?: number }>;

/** Все меши модели — до того, как к ним добавятся каркас и подсветка. */
export function collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
  });
  return meshes;
}

export function indexObjects(gltf: GLTF): Map<number, ModelObject> {
  const assoc = gltf.parser.associations as unknown as Associations;
  const result = new Map<number, ModelObject>();
  gltf.scene.traverse((node) => {
    const nodeIndex = assoc.get(node)?.nodes;
    if (nodeIndex === undefined) return;
    const meshes = (node as THREE.Mesh).isMesh
      ? [node as THREE.Mesh]
      : node.children.filter(
          (c): c is THREE.Mesh => (c as THREE.Mesh).isMesh && assoc.get(c)?.nodes === undefined,
        );
    if (meshes.length > 0) result.set(nodeIndex, { nodeIndex, node, meshes });
  });
  return result;
}

/** Мировой AABB собственных мешей объекта (с текущим поворотом модели). */
export function objectBox(meshes: THREE.Mesh[]): THREE.Box3 {
  const box = new THREE.Box3();
  const part = new THREE.Box3();
  for (const mesh of meshes) {
    mesh.updateWorldMatrix(true, false);
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      const inst = mesh as THREE.InstancedMesh;
      if (!inst.boundingBox) inst.computeBoundingBox();
      part.copy(inst.boundingBox!);
    } else {
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      part.copy(mesh.geometry.boundingBox!);
    }
    box.union(part.applyMatrix4(mesh.matrixWorld));
  }
  return box;
}

/** Освобождает модель вместе со всем, что вьювер к ней добавлял. */
export function disposeModel(root: THREE.Object3D, meshes: THREE.Mesh[]): void {
  applyDisplayMode(meshes, 'normal');
  disposeDisplayModes(meshes);
  disposeHighlights(meshes);
  disposeWireframe(root);
  disposeObject(root);
}
