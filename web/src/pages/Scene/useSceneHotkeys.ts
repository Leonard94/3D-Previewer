import { useEffect } from 'react';
import { useScene } from '../../store/scene.ts';
import { isTyping } from '../Viewer/useViewerHotkeys.ts';

/** Клавиши сцены — для окна «Горячие клавиши». */
export const SCENE_HOTKEYS: [string, string][] = [
  ['Shift+A', 'Добавить модель'],
  ['G', 'Перемещать выделенную модель (без выделения — сетка)'],
  ['R', 'Поворачивать выделенную модель (без выделения — вращение)'],
  ['Shift', 'Держать при перемещении — без привязки к шагу 10 см / 15°'],
  ['Shift+D', 'Дубль выделенной модели'],
  ['X', 'Убрать выделенную модель (или Delete)'],
  ['Esc', 'Снять выделение'],
];

/**
 * Клавиши сцены, как в Blender. Срабатывают раньше клавиш вьювера: у выделенной модели
 * G и R переключают гизмо, без выделения — сетка и вращение, как обычно.
 */
export function useSceneHotkeys(onAdd: () => void): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || document.querySelector('.modal')) return;
      const s = useScene.getState();
      const sel = s.selected;
      if (e.code === 'KeyA' && e.shiftKey) onAdd();
      else if (sel && e.code === 'KeyD' && e.shiftKey) s.duplicate(sel);
      else if (sel && e.code === 'KeyG' && !e.shiftKey) s.setGizmo('translate');
      else if (sel && e.code === 'KeyR' && !e.shiftKey) s.setGizmo('rotate');
      else if (sel && (e.code === 'KeyX' || e.code === 'Delete' || e.code === 'Backspace')) s.remove(sel);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    // Esc — обычной фазой: открытое окно или меню закрывается первым и до сюда его не пускает.
    const onEscape = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && !isTyping(e.target)) useScene.getState().select(null);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keydown', onEscape);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keydown', onEscape);
    };
  }, [onAdd]);
}
