import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { formatLength } from '../format.ts';
import { useViewer } from '../store/viewer.ts';
import type { ModelBounds } from './bounds.ts';
import { HIGHLIGHT_COLOR } from './highlight.ts';
import { CAMERA_FOV } from './views.ts';

/** Высота подписи на экране, px. */
const LABEL_PX = 22;
/** Канвас подписи рисуется крупнее — чётко и на Retina, и на скриншоте 2×. */
const LABEL_SUPERSAMPLE = 3;

const noRaycast = () => {};

/** Подпись-«таблетка»: текст на тёмной подложке. Размер на экране не зависит от расстояния. */
function createLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  const h = LABEL_PX * LABEL_SUPERSAMPLE;
  const font = `600 ${Math.round(h * 0.55)}px Inter, -apple-system, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width + h * 0.8);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = 'rgba(27, 29, 28, 0.88)';
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = HIGHLIGHT_COLOR;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, sizeAttenuation: false, depthTest: false, toneMapped: false });
  const sprite = new THREE.Sprite(material);
  sprite.userData.aspect = w / h;
  sprite.renderOrder = 11;
  sprite.raycast = noRaycast;
  return sprite;
}

/**
 * Габариты: рамка-параллелепипед вокруг модели и подписи длины, ширины и высоты (в метрах или сантиметрах) —
 * как размеры на чертеже. Живёт внутри поворотного стола, поэтому вращается вместе с моделью.
 */
export function Dimensions({ bounds }: { bounds: ModelBounds }) {
  const viewportHeight = useThree((s) => s.size.height);
  const unit = useViewer((s) => s.dimUnit);

  const { group, labels } = useMemo(() => {
    const { min, max } = bounds.box;
    const { size, center } = bounds;
    const group = new THREE.Group();

    const box = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z)),
      new THREE.LineBasicMaterial({ color: HIGHLIGHT_COLOR, transparent: true, opacity: 0.75, depthTest: false, toneMapped: false }),
    );
    box.position.copy(center);
    box.renderOrder = 10;
    box.raycast = noRaycast;
    group.add(box);

    // Подписи — на серединах рёбер, ближних к зрителю в виде «Общий» (спереди-справа).
    const lift = Math.max(size.length() * 0.015, 0.01);
    const labels = [
      [formatLength(size.x, unit), new THREE.Vector3(center.x, min.y, max.z + lift)], // длина — по X
      [formatLength(size.z, unit), new THREE.Vector3(max.x + lift, min.y, center.z)], // ширина — по Z
      [formatLength(size.y, unit), new THREE.Vector3(max.x + lift, center.y, max.z + lift)], // высота — по Y
    ].map(([text, pos]) => {
      const sprite = createLabel(text as string);
      sprite.position.copy(pos as THREE.Vector3);
      group.add(sprite);
      return sprite;
    });
    return { group, labels };
  }, [bounds, unit]);

  // sizeAttenuation = false: высота спрайта в долях экрана = scale / (2·tan(fov/2)).
  useEffect(() => {
    const k = (LABEL_PX / Math.max(viewportHeight, 1)) * 2 * Math.tan(THREE.MathUtils.degToRad(CAMERA_FOV) / 2);
    for (const s of labels) s.scale.set(k * (s.userData.aspect as number), k, 1);
  }, [labels, viewportHeight]);

  useEffect(
    () => () => {
      group.traverse((o) => {
        const obj = o as THREE.Mesh;
        // Геометрия спрайтов общая для всех спрайтов three — её не трогаем.
        if (!(o as THREE.Sprite).isSprite) obj.geometry?.dispose();
        const m = obj.material as THREE.Material | undefined;
        if (m) {
          (m as THREE.SpriteMaterial).map?.dispose();
          m.dispose();
        }
      });
    },
    [group],
  );

  return <primitive object={group} />;
}
