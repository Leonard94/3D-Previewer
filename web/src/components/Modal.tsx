import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Открытые окна по порядку: Esc закрывает только верхнее. */
const stack: object[] = [];

/** Модальное окно поверх страницы; закрывается по Esc и клику по фону. */
export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const token = useRef({}).current;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    stack.push(token);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || stack[stack.length - 1] !== token) return;
      e.stopPropagation();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      stack.splice(stack.indexOf(token), 1);
    };
  }, [token]);

  return createPortal(
    <div className="modal" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal__box${wide ? ' modal__box--wide' : ''}`} role="dialog" aria-modal>
        <div className="modal__head">
          <div className="modal__title">{title}</div>
          <button type="button" className="btn btn--small" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
