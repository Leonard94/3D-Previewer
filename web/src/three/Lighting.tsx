import { useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { ModelBounds } from './bounds.ts';
import { getRoomEnvironment, loadHdri, type LoadedHdri } from './environment.ts';
import type { DirectionalSpec, LightPreset, SpotSpec } from './lightPresets.ts';
import {
  configureDirectionalLight,
  configureSpotLight,
  createDirectionalLight,
  createSpotLight,
} from './presetLights.ts';

interface Props {
  preset: LightPreset;
  bounds: ModelBounds;
  /** Показывать HDRI фоном (если пресет это поддерживает). */
  envBackground?: boolean;
  /** Прозрачный фон — для миниатюр. */
  transparentBackground?: boolean;
  /** Переключатель «Тени». */
  shadows?: boolean;
  onHdriStatus?: (url: string, ok: boolean) => void;
}

/** Окружение, фон и источники света пресета. Тени подгоняются под AABB модели. */
export function Lighting({ preset, bounds, envBackground = true, transparentBackground, shadows = true, onHdriStatus }: Props) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const invalidate = useThree((s) => s.invalidate);

  const hdriUrl = preset.environment.type === 'hdri' ? preset.environment.url : null;
  const [hdri, setHdri] = useState<{ url: string; data: LoadedHdri | null } | null>(null);
  const loaded = hdri && hdri.url === hdriUrl ? hdri.data : null;

  useEffect(() => {
    if (!hdriUrl) return;
    let cancelled = false;
    loadHdri(hdriUrl).then(
      (data) => {
        if (cancelled) return;
        setHdri({ url: hdriUrl, data });
        onHdriStatus?.(hdriUrl, true);
      },
      (err: unknown) => {
        if (cancelled) return;
        console.warn(`HDRI ${hdriUrl} не загрузился — используется RoomEnvironment. Запустите npm run fetch:hdri.`, err);
        setHdri({ url: hdriUrl, data: null });
        onHdriStatus?.(hdriUrl, false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hdriUrl, onHdriStatus]);

  // Окружение и фон.
  useLayoutEffect(() => {
    // Пока HDRI грузится или если его нет — запасное окружение без файлов.
    scene.environment = loaded ? loaded.texture : getRoomEnvironment(gl);
    scene.environmentIntensity = preset.environment.intensity;

    const bgHdri = preset.background.hdri;
    if (transparentBackground) {
      scene.background = null;
    } else if (bgHdri && envBackground && loaded) {
      scene.background = loaded.texture;
      scene.backgroundBlurriness = bgHdri.blurriness;
      scene.backgroundIntensity = bgHdri.intensity;
    } else {
      scene.background = new THREE.Color(preset.background.color);
      scene.backgroundBlurriness = 0;
      scene.backgroundIntensity = 1;
    }
    gl.toneMappingExposure = preset.exposure;
    invalidate();
  }, [scene, gl, preset, loaded, envBackground, transparentBackground, invalidate]);

  useEffect(
    () => () => {
      scene.environment = null;
      scene.background = null;
    },
    [scene],
  );

  return (
    <>
      {preset.lights.map((spec, i) =>
        spec.kind === 'directional' ? (
          <DirectionalLight
            key={`${preset.id}-${i}`}
            spec={spec}
            bounds={bounds}
            shadowRadius={preset.shadow.radius}
            sunDirection={spec.followHdriSun ? (loaded?.sunDirection ?? null) : null}
            shadows={shadows}
          />
        ) : (
          <SpotLight key={`${preset.id}-${i}`} spec={spec} bounds={bounds} shadowRadius={preset.shadow.radius} shadows={shadows} />
        ),
      )}
    </>
  );
}

function DirectionalLight({
  spec,
  bounds,
  shadowRadius,
  sunDirection,
  shadows,
}: {
  spec: DirectionalSpec;
  bounds: ModelBounds;
  shadowRadius: number;
  sunDirection: THREE.Vector3 | null;
  shadows: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const light = useMemo(createDirectionalLight, []);
  const target = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    configureDirectionalLight(light, target, spec, bounds, shadowRadius, sunDirection, shadows);
    invalidate();
  }, [light, target, spec, bounds, shadowRadius, sunDirection, shadows, invalidate]);
  useEffect(() => () => light.dispose(), [light]);

  return (
    <>
      <primitive object={target} />
      <primitive object={light} />
    </>
  );
}

function SpotLight({
  spec,
  bounds,
  shadowRadius,
  shadows,
}: {
  spec: SpotSpec;
  bounds: ModelBounds;
  shadowRadius: number;
  shadows: boolean;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const light = useMemo(createSpotLight, []);
  const target = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    configureSpotLight(light, target, spec, bounds, shadowRadius, shadows);
    invalidate();
  }, [light, target, spec, bounds, shadowRadius, shadows, invalidate]);
  useEffect(() => () => light.dispose(), [light]);

  return (
    <>
      <primitive object={target} />
      <primitive object={light} />
    </>
  );
}
