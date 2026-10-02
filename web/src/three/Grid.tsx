import { useMemo } from 'react';
import * as THREE from 'three';
import type { ModelBounds } from './bounds.ts';

export const GRID_CELL = 1; // м
export const GRID_MAJOR_EVERY = 5; // акцентная линия каждые 5 м

const vertexShader = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uMinorColor;
  uniform vec3 uMajorColor;
  uniform float uMinorOpacity;
  uniform float uMajorOpacity;
  uniform float uCell;
  uniform float uMajor;
  uniform vec2 uCenter;
  uniform float uFadeRadius;
  varying vec3 vWorld;

  // Сглаженная линия сетки толщиной ~width пикселей (через производные экрана).
  float gridLine(vec2 p, float cell, float width) {
    vec2 coord = p / cell;
    vec2 g = abs(fract(coord - 0.5) - 0.5) / fwidth(coord);
    return 1.0 - min(min(g.x, g.y) / width, 1.0);
  }

  void main() {
    float minor = gridLine(vWorld.xz, uCell, 1.0);
    float major = gridLine(vWorld.xz, uCell * uMajor, 1.4);
    float d = distance(vWorld.xz, uCenter);
    float fade = 1.0 - smoothstep(uFadeRadius * 0.35, uFadeRadius, d);
    float a = max(minor * uMinorOpacity, major * uMajorOpacity) * fade;
    if (a < 0.004) discard;
    vec3 color = mix(uMinorColor, uMajorColor, step(minor * uMinorOpacity, major * uMajorOpacity));
    gl_FragColor = vec4(color, a);
    #include <colorspace_fragment>
  }
`;

export interface GridStyle {
  minorColor: string;
  majorColor: string;
  minorOpacity: number;
  majorOpacity: number;
}

export const DEFAULT_GRID_STYLE: GridStyle = {
  minorColor: '#ffffff',
  majorColor: '#d9c7a0',
  minorOpacity: 0.22,
  majorOpacity: 0.55,
};

/** Радиус, к которому сетка затухает: с запасом вокруг модели, но не меньше 10 м. */
export const gridRadius = (bounds: ModelBounds) => Math.max(10, bounds.radius * 6);

/**
 * Сетка на полу: клетка 1 м, акцентная линия каждые 5 м, затухание к краям.
 * Плоскость односторонняя — снизу (из-под пола) не видна.
 */
export function Grid({ bounds, style = DEFAULT_GRID_STYLE }: { bounds: ModelBounds; style?: GridStyle }) {
  const radius = gridRadius(bounds);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        uniforms: {
          uMinorColor: { value: new THREE.Color() },
          uMajorColor: { value: new THREE.Color() },
          uMinorOpacity: { value: 0 },
          uMajorOpacity: { value: 0 },
          uCell: { value: GRID_CELL },
          uMajor: { value: GRID_MAJOR_EVERY },
          uCenter: { value: new THREE.Vector2() },
          uFadeRadius: { value: 10 },
        },
      }),
    [],
  );

  const u = material.uniforms;
  u.uMinorColor!.value.set(style.minorColor);
  u.uMajorColor!.value.set(style.majorColor);
  u.uMinorOpacity!.value = style.minorOpacity;
  u.uMajorOpacity!.value = style.majorOpacity;
  u.uCenter!.value.set(bounds.center.x, bounds.center.z);
  u.uFadeRadius!.value = radius;

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[bounds.center.x, 0, bounds.center.z]}
      material={material}
      renderOrder={1}
      raycast={() => null}
    >
      <planeGeometry args={[radius * 2, radius * 2]} />
    </mesh>
  );
}
