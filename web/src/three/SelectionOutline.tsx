import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutlinePass } from 'three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { HIGHLIGHT_COLOR } from './highlight.ts';

/**
 * Активный композер обводки — скриншот рендерит кадр через него, чтобы обводка попала в картинку.
 * null — обводки нет, кадр рисует сам r3f.
 */
export const activeComposer: { current: EffectComposer | null } = { current: null };

/**
 * Обводка выделенного объекта (OutlinePass). Монтируется только пока что-то выделено:
 * в это время кадр рисует композер (useFrame с приоритетом 1), иначе — обычный рендер r3f.
 */
export function SelectionOutline({ objects }: { objects: THREE.Object3D[] }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const invalidate = useThree((s) => s.invalidate);

  const pipeline = useMemo(() => {
    // HalfFloat + MSAA: тонмаппинг делает OutputPass, края сглажены как без композера.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new EffectComposer(gl, target);
    composer.addPass(new RenderPass(scene, camera));
    const outline = new OutlinePass(new THREE.Vector2(1, 1), scene, camera);
    outline.edgeStrength = 4;
    outline.edgeThickness = 1;
    outline.edgeGlow = 0;
    outline.visibleEdgeColor.set(HIGHLIGHT_COLOR);
    outline.hiddenEdgeColor.set(HIGHLIGHT_COLOR).multiplyScalar(0.35);
    composer.addPass(outline);
    composer.addPass(new OutputPass());
    return { composer, outline, target };
  }, [gl, scene, camera]);

  useEffect(() => {
    pipeline.composer.setPixelRatio(dpr);
    pipeline.composer.setSize(size.width, size.height);
    invalidate();
  }, [pipeline, size, dpr, invalidate]);

  useEffect(() => {
    pipeline.outline.selectedObjects = objects;
    invalidate();
  }, [pipeline, objects, invalidate]);

  useEffect(() => {
    activeComposer.current = pipeline.composer;
    invalidate();
    return () => {
      if (activeComposer.current === pipeline.composer) activeComposer.current = null;
      pipeline.outline.dispose();
      pipeline.composer.dispose();
      pipeline.target.dispose();
      invalidate();
    };
  }, [pipeline, invalidate]);

  useFrame(() => pipeline.composer.render(), 1);
  return null;
}
