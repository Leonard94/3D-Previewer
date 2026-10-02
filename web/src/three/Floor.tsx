import type { ModelBounds } from './bounds.ts';
import { gridRadius } from './Grid.tsx';

/** Пол на y = 0: только принимает тени. Односторонний — снизу не рисуется. */
export function Floor({ bounds, opacity = 0.32 }: { bounds: ModelBounds; opacity?: number }) {
  const radius = gridRadius(bounds);
  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[bounds.center.x, 0, bounds.center.z]}
      receiveShadow
      renderOrder={0}
      raycast={() => null}
    >
      <planeGeometry args={[radius * 2, radius * 2]} />
      <shadowMaterial transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}
