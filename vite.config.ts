import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/** Порт API берём из конфига приложения, чтобы dev-прокси попадал в сервер. */
function apiPort(): number {
  try {
    const cfg = JSON.parse(readFileSync(new URL('./3d-previewer.config.json', import.meta.url), 'utf8')) as { port?: number };
    return cfg.port ?? 4310;
  } catch {
    return 4310;
  }
}

const port = apiPort();

export default defineConfig({
  root: fileURLToPath(new URL('./web', import.meta.url)),
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
  },
  server: {
    host: '127.0.0.1',
    port: port + 1,
    proxy: {
      '/api': { target: `http://127.0.0.1:${port}`, ws: true },
    },
  },
});
