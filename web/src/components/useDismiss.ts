import { useEffect, type RefObject } from 'react';

/**
 * Закрывает всплывающее окно по клику мимо ref и по Esc. Esc перехватывается раньше горячих клавиш
 * вьювера — чтобы закрытие окна не снимало заодно выделение объекта.
 */
export function useDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, ref, close]);
}
