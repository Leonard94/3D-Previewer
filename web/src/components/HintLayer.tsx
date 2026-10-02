import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './HintLayer.css';

/**
 * Всплывающие подсказки для любых элементов с атрибутом data-hint.
 * Появляются сразу при наведении или фокусе. На неинтерактивных элементах (подписи метрик)
 * клик закрепляет подсказку — закрывается кликом в другом месте или Esc. При прокрутке едет за элементом.
 */
const INTERACTIVE = 'button, a, input, select, textarea, label';
const GAP = 8;
const MARGIN = 8;

interface Shown {
  el: HTMLElement;
  text: string;
  pinned: boolean;
}

function hintTarget(node: EventTarget | null): HTMLElement | null {
  return node instanceof Element ? (node.closest('[data-hint]') as HTMLElement | null) : null;
}

export function HintLayer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  /** Растёт при прокрутке и ресайзе — пересчитать позицию. */
  const [tick, setTick] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    const show = (el: HTMLElement, pinned: boolean) => {
      const text = el.dataset.hint;
      if (text) setShown({ el, text, pinned });
    };
    const onOver = (e: PointerEvent) => {
      const el = hintTarget(e.target);
      const cur = shownRef.current;
      if (cur?.pinned && cur.el !== el) return;
      if (el && el !== cur?.el) show(el, false);
    };
    const onOut = (e: PointerEvent) => {
      const cur = shownRef.current;
      if (!cur || cur.pinned) return;
      // Ушли с элемента (а не на его потомка).
      if (!cur.el.contains(e.relatedTarget as Node | null)) setShown(null);
    };
    const onClick = (e: MouseEvent) => {
      const el = hintTarget(e.target);
      const cur = shownRef.current;
      if (el && !el.matches(INTERACTIVE) && !el.closest(INTERACTIVE)) {
        // Клик по подписи с подсказкой — закрепить или открепить.
        setShown(cur?.pinned && cur.el === el ? null : { el, text: el.dataset.hint ?? '', pinned: true });
        return;
      }
      if (cur?.pinned) setShown(null);
    };
    const onFocus = (e: FocusEvent) => {
      const el = hintTarget(e.target);
      if (el && e.target instanceof HTMLElement && e.target.matches(':focus-visible')) show(el, false);
    };
    const onBlur = () => {
      if (!shownRef.current?.pinned) setShown(null);
    };
    const hide = () => setShown(null);
    const reposition = () => setTick((t) => t + 1);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && shownRef.current) hide();
    };

    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerout', onOut);
    document.addEventListener('click', onClick);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onBlur);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerout', onOut);
      document.removeEventListener('click', onClick);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onBlur);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, []);

  // Позиция: под элементом, а если не помещается — над ним; по горизонтали в пределах окна.
  useLayoutEffect(() => {
    if (!shown || !boxRef.current) {
      setPos(null);
      return;
    }
    const r = shown.el.getBoundingClientRect();
    // Элемент уехал за край окна — прячем.
    if (r.bottom < 0 || r.top > window.innerHeight) {
      setShown(null);
      return;
    }
    const box = boxRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = r.bottom + GAP;
    if (top + box.height > vh - MARGIN) top = Math.max(MARGIN, r.top - GAP - box.height);
    const left = Math.min(Math.max(MARGIN, r.left), vw - box.width - MARGIN);
    setPos({ left, top });
  }, [shown, tick]);

  // Элемент мог исчезнуть из DOM (перерисовка) — прячем подсказку.
  useEffect(() => {
    if (shown && !shown.el.isConnected) setShown(null);
  });

  if (!shown) return null;
  return createPortal(
    <div
      ref={boxRef}
      className={`hint${shown.pinned ? ' hint--pinned' : ''}`}
      role="tooltip"
      style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0 }}
    >
      {shown.text}
    </div>,
    document.body,
  );
}
