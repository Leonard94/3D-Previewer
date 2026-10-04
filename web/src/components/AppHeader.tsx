import { Link } from 'react-router';
import { useCatalog } from '../store/catalog.ts';
import './AppHeader.css';

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const config = useCatalog((s) => s.config);
  const connected = useCatalog((s) => s.connected);
  return (
    <header className="app-header">
      <div className="app-header__main">
        <Link to="/" className="app-header__title">
          3D Previewer
        </Link>
        {children}
      </div>
      <div className="app-header__side">
        {config && (
          <span className="mono muted app-header__path" title={config.modelsDir}>
            {/* LRM: при direction: rtl (многоточие слева) ведущий «/» не уезжает в конец */}
            {'\u200e' + config.modelsDir + '\u200e'}
          </span>
        )}
        <span className={`app-header__dot ${connected ? 'on' : ''}`} data-hint={connected ? 'Связь с сервером есть' : 'Нет связи с сервером'} />
        <Link to="/scene" className="btn" data-hint="Несколько моделей вместе">
          Сцена
        </Link>
        <Link to="/settings" className="btn">
          Настройки
        </Link>
      </div>
    </header>
  );
}
