import * as THREE from 'three';

export interface ModelBounds {
  box: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
  /** Радиус описанной сферы AABB. */
  radius: number;
}

/** Мировой AABB всех мешей (точный, по вершинам). */
export function computeBounds(root: THREE.Object3D): ModelBounds {
  root.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(root, true);
  if (box.isEmpty()) box.set(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1, 0.5));
  return boundsFromBox(box);
}

export function boundsFromBox(box: THREE.Box3): ModelBounds {
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const radius = Math.max(size.length() / 2, 0.01);
  return { box, center, size, radius };
}
