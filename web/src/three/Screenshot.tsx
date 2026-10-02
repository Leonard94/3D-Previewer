import { useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import { useViewer } from '../store/viewer.ts';
import { LIGHT_PRESETS } from './lightPresets.ts';
import { activeComposer } from './SelectionOutline.tsx';
import { VIEW_LABELS } from './views.ts';

/** Скриншот — в 2× от размера вьюпорта. */
const SCREENSHOT_SCALE = 2;

const safeFileName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim() || 'model';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * PNG текущего кадра без UI-оверлеев (они в DOM, а не на канвасе).
 * Кадр перерисовывается сразу в 2× и снимается в той же задаче — до того, как браузер его покажет.
 */
export function Screenshot({ title }: { title: string }) {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const seq = useViewer((s) => s.screenshotSeq);
  const lastSeq = useRef(seq);

  useEffect(() => {
    if (seq === lastSeq.current) return;
    lastSeq.current = seq;

    const { activeView, lightPreset } = useViewer.getState();
    const name = `${safeFileName(title)}_${activeView ? VIEW_LABELS[activeView] : 'Свободный'}_${LIGHT_PRESETS[lightPreset].label}.png`;
    const prevRatio = gl.getPixelRatio();
    const composer = activeComposer.current;
    const ratio = SCREENSHOT_SCALE;
    gl.setPixelRatio(ratio);
    if (composer) {
      composer.setPixelRatio(ratio);
      composer.render();
    } else {
      gl.render(scene, camera);
    }
    // toBlob копирует кадр в момент вызова — дальше можно возвращать разрешение.
    gl.domElement.toBlob((blob) => {
      if (blob) download(blob, name);
      else useViewer.getState().showToast('Не удалось сохранить скриншот');
    }, 'image/png');
    gl.setPixelRatio(prevRatio);
    composer?.setPixelRatio(prevRatio);
    invalidate();
  }, [seq, title, gl, scene, camera, invalidate]);

  return null;
}
