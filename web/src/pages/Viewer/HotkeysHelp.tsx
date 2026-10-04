import { Modal } from '../../components/Modal.tsx';
import { useViewer } from '../../store/viewer.ts';
import { HOTKEYS, MOUSE_CONTROLS } from './useViewerHotkeys.ts';

/** Окно со списком горячих клавиш и управления мышью (клавиша «?»). extra — клавиши страницы (сцены). */
export function HotkeysHelp({ extra }: { extra?: { title: string; rows: [string, string][] } }) {
  const open = useViewer((s) => s.hotkeysOpen);
  const setOpen = useViewer((s) => s.setHotkeysOpen);
  if (!open) return null;
  return (
    <Modal title="Горячие клавиши" onClose={() => setOpen(false)}>
      <div className="hotkeys">
        {extra && (
          <>
            <div className="section-title">{extra.title}</div>
            <dl className="hotkeys__list">
              {extra.rows.map(([key, action]) => (
                <div key={key} className="hotkeys__row">
                  <dt>
                    <kbd className="kbd">{key}</kbd>
                  </dt>
                  <dd>{action}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <div className="section-title">Клавиатура</div>
        <dl className="hotkeys__list">
          {HOTKEYS.map((h) => (
            <div key={h.label} className="hotkeys__row">
              <dt>
                <kbd className="kbd">{h.label}</kbd>
              </dt>
              <dd>{h.action}</dd>
            </div>
          ))}
          <div className="hotkeys__row">
            <dt>
              <kbd className="kbd">?</kbd>
            </dt>
            <dd>Этот список</dd>
          </div>
        </dl>
        <div className="section-title">Мышь</div>
        <dl className="hotkeys__list">
          {MOUSE_CONTROLS.map(([key, action]) => (
            <div key={key} className="hotkeys__row">
              <dt>{key}</dt>
              <dd>{action}</dd>
            </div>
          ))}
        </dl>
        <p className="muted hotkeys__note">Клавиши не срабатывают, когда курсор в поле ввода. Работают в любой раскладке.</p>
      </div>
    </Modal>
  );
}
