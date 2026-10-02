import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../api/client.ts';
import { AppHeader } from '../../components/AppHeader.tsx';
import { startCatalogSync, useCatalog } from '../../store/catalog.ts';
import './SettingsPage.css';

const SOURCE_NOTE = {
  cli: 'Сейчас папка задана аргументом --models-dir: после перезапуска с этим аргументом он снова будет главнее конфига.',
  env: 'Сейчас папка задана переменной окружения MODELS_DIR: после перезапуска она снова будет главнее конфига.',
  config: null,
} as const;

export function SettingsPage() {
  useEffect(() => {
    startCatalogSync();
    document.title = 'Настройки — 3D Previewer';
  }, []);

  const config = useCatalog((s) => s.config);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (config) setValue(config.modelsDir);
  }, [config?.modelsDir]);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await api.putConfig({ modelsDir: value });
      useCatalog.setState({ config: res });
      setMessage({ ok: true, text: 'Папка применена, каталог пересканируется.' });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <AppHeader />
      <main className="settings">
        <Link to="/" className="settings__back muted">
          ← Каталог
        </Link>
        <h1 className="section-title">Настройки</h1>

        <section className="settings__card">
          <div className="settings__label">Папка моделей</div>
          {config && (
            <p className="mono muted">
              Сейчас: {config.modelsDir}
              {!config.modelsDirExists && <span className="settings__err"> — не существует</span>}
            </p>
          )}
          <form onSubmit={apply} className="settings__row">
            <input
              className="input mono settings__input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="/Users/…/godot-проект/assets/models"
              spellCheck={false}
            />
            <button className="btn primary" disabled={busy || !value.trim()}>
              Применить
            </button>
          </form>
          {message && <p className={message.ok ? 'settings__ok' : 'settings__err'}>{message.text}</p>}
          {config && SOURCE_NOTE[config.modelsDirSource] && <p className="muted">{SOURCE_NOTE[config.modelsDirSource]}</p>}
          <p className="muted">
            Обычно это <span className="mono">assets/models</span> внутри Godot-проекта (<span className="mono">res://assets/models</span>).
            Приложение ничего не пишет в эту папку.
          </p>
        </section>

        <ThumbsCard />
      </main>
    </div>
  );
}

function ThumbsCard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function regenerate() {
    setBusy(true);
    setMessage(null);
    try {
      await api.resetThumbs();
      setMessage({ ok: true, text: 'Миниатюры удалены — каталог отрисует их заново.' });
    } catch (err) {
      setMessage({ ok: false, text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="settings__card">
      <div className="settings__label">Миниатюры</div>
      <p className="muted">
        Миниатюры рисуются в браузере на странице каталога и хранятся в <span className="mono">.cache/thumbs</span> внутри
        папки приложения. После изменения модели её миниатюра обновляется сама.
      </p>
      <button type="button" className="btn" onClick={regenerate} disabled={busy}>
        Перегенерировать все миниатюры
      </button>
      {message && <p className={message.ok ? 'settings__ok' : 'settings__err'}>{message.text}</p>}
    </section>
  );
}
