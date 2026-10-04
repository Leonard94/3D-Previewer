import { useEffect } from 'react';
import { useViewer } from '../../store/viewer.ts';

type ViewerState = ReturnType<typeof useViewer.getState>;

export interface Hotkey {
  /** e.code — чтобы работало и в русской раскладке. */
  codes: string[];
  /** Как клавиша подписана в списке. */
  label: string;
  action: string;
  run: (s: ViewerState) => void;
}

/** Единый список: по нему работают и обработчик, и окно «Горячие клавиши». */
export const HOTKEYS: Hotkey[] = [
  { codes: ['Digit1'], label: '1', action: 'Вид «Общий»', run: (s) => s.setView('general') },
  { codes: ['Digit2'], label: '2', action: 'Вид «Сверху»', run: (s) => s.setView('top') },
  { codes: ['Digit3'], label: '3', action: 'Вид «Сбоку»', run: (s) => s.setView('side') },
  { codes: ['KeyF'], label: 'F', action: 'Вписать модель', run: (s) => s.fit() },
  { codes: ['KeyW'], label: 'W', action: 'Каркас: нет → поверх модели → только каркас', run: (s) => s.cycleWireframe() },
  { codes: ['KeyR'], label: 'R', action: 'Вращение', run: (s) => s.setRotate(!s.rotate) },
  { codes: ['KeyL'], label: 'L', action: 'Следующий пресет света', run: (s) => s.nextLightPreset() },
  { codes: ['KeyG'], label: 'G', action: 'Сетка', run: (s) => s.setGrid(!s.grid) },
  { codes: ['KeyH'], label: 'H', action: 'Манекен 1,8 м', run: (s) => s.setMannequin(!s.mannequin) },
  { codes: ['KeyB'], label: 'B', action: 'Габариты', run: (s) => s.setDimensions(!s.dimensions) },
  { codes: ['KeyP'], label: 'P', action: 'Скриншот', run: (s) => s.requestScreenshot() },
  { codes: ['Escape'], label: 'Esc', action: 'Снять выделение объекта', run: (s) => s.selectObject(null) },
];

export const MOUSE_CONTROLS: [string, string][] = [
  ['ЛКМ', 'Вращение камеры'],
  ['Колесо', 'Масштаб'],
  ['ПКМ', 'Сдвиг'],
  ['Двойной клик', 'Приблизить к точке и вращать вокруг неё'],
];

/** Поля, где клавиши вводят текст. Переключатели и ползунки — не в счёт: после клика по ним клавиши работают. */
const NON_TEXT_INPUTS = new Set(['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'color', 'file']);

export function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  if (el.tagName === 'INPUT') return !NON_TEXT_INPUTS.has((el as HTMLInputElement).type);
  return el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
}

/** Горячие клавиши вьювера (не срабатывают при вводе текста). «?» — список клавиш. */
export function useViewerHotkeys(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      const s = useViewer.getState();
      // «?» в любой раскладке: в русской это Shift+7, в английской — Shift+/.
      if (e.key === '?' || (e.code === 'Slash' && e.shiftKey)) {
        s.setHotkeysOpen(!s.hotkeysOpen);
        e.preventDefault();
        return;
      }
      const hotkey = HOTKEYS.find((h) => h.codes.includes(e.code));
      if (!hotkey) return;
      hotkey.run(s);
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
