import { createReadStream, existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import Fastify, { type FastifyReply } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { WebSocket } from 'ws';
import type { ApiError, ConfigResponse, ConfigUpdate, ServerEvent } from '../shared/types.ts';
import {
  CACHE_DIR,
  WEB_DIST_DIR,
  isReadableDir,
  loadConfig,
  resolveUserPath,
  saveConfig,
  type LoadedConfig,
} from './config.ts';
import { ModelLibrary } from './scanner.ts';
import { getTexturePreview, pruneTexturePreviews, readImageBytes } from './texturePreviews.ts';
import { openFile, revealFile } from './system.ts';
import { THUMB_MAX_BYTES, ThumbStore, isThumbHash, sniffThumb } from './thumbs.ts';

const loaded: LoadedConfig = await loadConfig(process.argv.slice(2));
const { config, fileConfig } = loaded;
let modelsDirSource = loaded.modelsDirSource;

const thumbs = new ThumbStore(CACHE_DIR);
await thumbs.init();
const library = new ModelLibrary(CACHE_DIR, thumbs);
const app = Fastify({ logger: false });

// ---------- WebSocket ----------

const clients = new Set<WebSocket>();

function broadcast(event: ServerEvent): void {
  const data = JSON.stringify(event);
  for (const ws of clients) if (ws.readyState === ws.OPEN) ws.send(data);
}

library.on('event', broadcast);

let lastReadyLog = '';
let prunedOnce = false;
library.on('ready', () => {
  const msg = `[scan] готово, моделей: ${library.list().length} (${library.dir})`;
  if (msg !== lastReadyLog) console.log((lastReadyLog = msg));
  // После первого полного скана — убрать превью текстур и миниатюры удалённых моделей.
  if (!prunedOnce) {
    prunedOnce = true;
    const live = library.liveHashes();
    void pruneTexturePreviews(CACHE_DIR, live);
    void thumbs.prune(live).then((n) => n > 0 && console.log(`[thumbs] удалено неиспользуемых миниатюр: ${n}`));
  }
});

await app.register(fastifyWebsocket);
app.register(async (scope) => {
  scope.get('/api/events', { websocket: true }, (socket) => {
    clients.add(socket);
    socket.on('close', () => clients.delete(socket));
    socket.on('error', () => clients.delete(socket));
  });
});

// ---------- helpers ----------

function fail(reply: FastifyReply, status: number, error: string) {
  return reply.code(status).send({ error } satisfies ApiError);
}

/**
 * ID модели — POSIX-путь к .glb относительно modelsDir (Fastify уже декодировал его из URL).
 * Всё, что выходит за пределы папки или не .glb, — 400; неизвестная модель — 404.
 */
function resolveModelId(id: string, reply: FastifyReply): string | null {
  const bad =
    !id ||
    id.includes('\0') ||
    id.includes('\\') ||
    id.startsWith('/') ||
    !/\.glb$/i.test(id) ||
    id.split('/').some((seg) => seg === '..' || seg === '.' || seg === '');
  if (bad) {
    fail(reply, 400, 'Некорректный идентификатор модели');
    return null;
  }
  const abs = path.resolve(library.dir, ...id.split('/'));
  if (!abs.startsWith(library.dir + path.sep)) {
    fail(reply, 400, 'Путь за пределами папки моделей');
    return null;
  }
  if (!library.has(id)) {
    fail(reply, 404, 'Модель не найдена');
    return null;
  }
  return id;
}

async function configResponse(): Promise<ConfigResponse> {
  return {
    modelsDir: library.dir,
    modelsDirExists: await isReadableDir(library.dir),
    modelsDirSource,
  };
}

// ---------- API ----------

app.get('/api/config', async () => configResponse());

app.put<{ Body: ConfigUpdate }>('/api/config', async (req, reply) => {
  const raw = typeof req.body?.modelsDir === 'string' ? req.body.modelsDir.trim() : '';
  if (!raw) return fail(reply, 400, 'Укажите путь к папке моделей');
  if (!path.isAbsolute(raw) && !raw.startsWith('~')) return fail(reply, 400, 'Нужен абсолютный путь');
  const dir = resolveUserPath(raw, process.cwd());
  if (!(await isReadableDir(dir))) return fail(reply, 400, `Папка не существует или недоступна для чтения: ${dir}`);

  config.modelsDir = dir;
  fileConfig.modelsDir = dir;
  await saveConfig(fileConfig);
  modelsDirSource = 'config';
  await library.start(dir);
  broadcast({ type: 'config-changed' });
  return configResponse();
});

app.get('/api/models', async () => library.list());

app.get<{ Params: { id: string } }>('/api/models/:id', async (req, reply) => {
  const id = resolveModelId(req.params.id, reply);
  if (!id) return reply;
  return library.details(id);
});

app.get<{ Params: { id: string } }>('/api/models/:id/file', async (req, reply) => {
  const id = resolveModelId(req.params.id, reply);
  if (!id) return reply;
  const details = library.details(id)!;
  const etag = `"${details.hash}"`;
  reply.header('ETag', etag).header('Cache-Control', 'no-cache');
  if (req.headers['if-none-match'] === etag) return reply.code(304).send();
  return reply
    .header('Content-Type', 'model/gltf-binary')
    .header('Content-Length', details.fileSize)
    .send(createReadStream(details.glbPath));
});

app.get<{ Params: { id: string; index: string }; Querystring: { full?: string } }>(
  '/api/models/:id/images/:index',
  async (req, reply) => {
    const id = resolveModelId(req.params.id, reply);
    if (!id) return reply;
    const index = Number(req.params.index);
    const details = library.details(id)!;
    const range = library.analysis(id)?.imageRanges[index];
    const tex = details.textures[index];
    if (!Number.isInteger(index) || !range || !tex?.hasPreview) return fail(reply, 404, 'Превью для этой текстуры нет');

    const etag = `"${details.hash}-${index}${req.query.full ? '-full' : ''}"`;
    reply.header('ETag', etag).header('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    if (req.query.full) {
      // Исходное изображение — для просмотра крупно.
      return reply.header('Content-Type', range.mimeType).send(await readImageBytes(details.glbPath, range));
    }
    const png = await getTexturePreview(CACHE_DIR, details.hash, index, details.glbPath, range);
    return reply.header('Content-Type', 'image/png').send(png);
  },
);

// ---------- системные команды ----------

app.post<{ Params: { id: string } }>('/api/models/:id/reveal', async (req, reply) => {
  const id = resolveModelId(req.params.id, reply);
  if (!id) return reply;
  try {
    await revealFile(library.details(id)!.glbPath);
  } catch (err) {
    return fail(reply, 500, `Не удалось показать файл: ${(err as Error).message}`);
  }
  return reply.code(204).send();
});

app.post<{ Params: { id: string } }>('/api/models/:id/open-blend', async (req, reply) => {
  const id = resolveModelId(req.params.id, reply);
  if (!id) return reply;
  const blend = library.details(id)!.blendPath;
  if (!blend) return fail(reply, 404, 'У модели нет исходника .blend');
  try {
    await openFile(blend);
  } catch (err) {
    return fail(reply, 500, `Не удалось открыть .blend: ${(err as Error).message}`);
  }
  return reply.code(204).send();
});

// ---------- миниатюры ----------

app.addContentTypeParser(['image/webp', 'image/png'], { parseAs: 'buffer', bodyLimit: THUMB_MAX_BYTES }, (_req, body, done) =>
  done(null, body),
);

app.get<{ Params: { hash: string } }>('/api/thumbs/:hash', async (req, reply) => {
  const thumb = isThumbHash(req.params.hash) ? thumbs.get(req.params.hash) : null;
  if (!thumb) return fail(reply, 404, 'Миниатюры нет');
  let stat;
  try {
    stat = await fs.stat(thumb.file);
  } catch {
    return fail(reply, 404, 'Миниатюры нет');
  }
  // Хеш в URL не меняется при «Перегенерировать все» — поэтому ревалидация по ETag.
  const etag = `"${Math.round(stat.mtimeMs).toString(36)}-${stat.size.toString(36)}"`;
  reply.header('ETag', etag).header('Cache-Control', 'no-cache');
  if (req.headers['if-none-match'] === etag) return reply.code(304).send();
  return reply.header('Content-Type', thumb.mimeType).header('Content-Length', stat.size).send(createReadStream(thumb.file));
});

app.put<{ Params: { hash: string }; Body: Buffer }>('/api/thumbs/:hash', async (req, reply) => {
  const { hash } = req.params;
  if (!isThumbHash(hash)) return fail(reply, 400, 'Некорректный хеш');
  if (!library.liveHashes().has(hash)) return fail(reply, 404, 'Модели с таким хешем нет');
  const body = req.body;
  const format = Buffer.isBuffer(body) ? sniffThumb(body) : null;
  if (!format) return fail(reply, 400, 'Ожидается изображение WebP или PNG');
  await thumbs.save(hash, body, format);
  library.thumbChanged(hash);
  return reply.code(204).send();
});

app.delete('/api/thumbs', async (_req, reply) => {
  await thumbs.clear();
  library.thumbsCleared();
  return reply.code(204).send();
});

// ---------- статика собранного фронта (npm start) ----------

const hasDist = existsSync(path.join(WEB_DIST_DIR, 'index.html'));
if (hasDist) {
  // wildcard (по умолчанию) — файлы ищутся на диске при каждом запросе,
  // поэтому пересборка фронта при запущенном сервере не ломает страницу.
  await app.register(fastifyStatic, { root: WEB_DIST_DIR });
}

app.setNotFoundHandler((req, reply) => {
  const urlPath = req.url.split('?')[0]!;
  const isPage = req.method === 'GET' && !urlPath.startsWith('/api/') && !path.extname(urlPath);
  if (!hasDist || !isPage) return fail(reply, 404, 'Не найдено');
  // SPA: страницы фронта (/, /view, /settings) отдают index.html
  return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
});

app.setErrorHandler((err, _req, reply) => {
  console.error('[http]', err);
  const status = (err as { statusCode?: number }).statusCode ?? 500;
  return fail(reply, status, (err as Error).message || 'Внутренняя ошибка');
});

// ---------- запуск ----------

if (!(await isReadableDir(config.modelsDir))) console.warn('Папка моделей не существует — укажите её в «Настройках».');
await library.start(config.modelsDir);

try {
  await app.listen({ host: config.host, port: config.port });
} catch (err) {
  if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
    console.error(`Порт ${config.port} занят. Закройте другой экземпляр или поменяйте port в 3d-previewer.config.json.`);
    process.exit(1);
  }
  throw err;
}

const url = `http://${config.host}:${config.port}`;
console.log(`3D Previewer: сервер ${url}${hasDist ? '' : ' (только API — фронт отдаёт Vite)'}`);
console.log(`Папка моделей: ${config.modelsDir}${modelsDirSource === 'config' ? '' : ` (из ${modelsDirSource === 'cli' ? '--models-dir' : 'MODELS_DIR'})`}`);

async function shutdown() {
  await library.dispose();
  await app.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
