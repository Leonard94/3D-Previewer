import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelsDirSource } from '../shared/types.ts';

export const APP_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
export const CONFIG_PATH = path.join(APP_ROOT, '3d-previewer.config.json');
export const CACHE_DIR = path.join(APP_ROOT, '.cache');
export const WEB_DIST_DIR = path.join(APP_ROOT, 'web', 'dist');

export interface AppConfig {
  modelsDir: string;
  host: string;
  port: number;
}

const DEFAULT_CONFIG: AppConfig = {
  // Временная папка на время разработки; потом заменяется на res://assets/models игры.
  modelsDir: path.join(APP_ROOT, 'models'),
  host: '127.0.0.1',
  port: 4310,
};

export interface LoadedConfig {
  /** Действующие настройки (с учётом CLI и переменных окружения). */
  config: AppConfig;
  /** То, что лежит в файле, — именно это сохраняется обратно. */
  fileConfig: AppConfig;
  modelsDirSource: ModelsDirSource;
}

/** `~/x` → домашняя папка, относительный путь — от `base`. */
export function resolveUserPath(p: string, base: string): string {
  const trimmed = p.trim();
  if (trimmed === '~') return os.homedir();
  if (trimmed.startsWith('~/')) return path.join(os.homedir(), trimmed.slice(2));
  return path.resolve(base, trimmed);
}

function readCliModelsDir(argv: string[]): string | null {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--models-dir') return argv[i + 1] ?? null;
    if (arg.startsWith('--models-dir=')) return arg.slice('--models-dir='.length);
  }
  return null;
}

async function readConfigFile(): Promise<Partial<AppConfig> | null> {
  try {
    return JSON.parse(await fs.readFile(CONFIG_PATH, 'utf8')) as Partial<AppConfig>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw new Error(`Не удалось прочитать ${CONFIG_PATH}: ${(err as Error).message}`);
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  const tmp = `${CONFIG_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(config, null, 2) + '\n');
  await fs.rename(tmp, CONFIG_PATH);
}

/** Приоритет папки моделей: --models-dir > MODELS_DIR > конфиг. */
export async function loadConfig(argv: string[]): Promise<LoadedConfig> {
  const fromFile = await readConfigFile();
  const fileConfig: AppConfig = { ...DEFAULT_CONFIG, ...fromFile };
  if (!fromFile) await saveConfig(fileConfig);
  const config = { ...fileConfig };
  config.modelsDir = resolveUserPath(config.modelsDir, APP_ROOT);
  const envPort = Number(process.env.PORT);
  if (Number.isInteger(envPort) && envPort > 0) config.port = envPort;

  const cli = readCliModelsDir(argv);
  if (cli) return { config: { ...config, modelsDir: resolveUserPath(cli, process.cwd()) }, fileConfig, modelsDirSource: 'cli' };
  const env = process.env.MODELS_DIR;
  if (env) return { config: { ...config, modelsDir: resolveUserPath(env, process.cwd()) }, fileConfig, modelsDirSource: 'env' };
  return { config, fileConfig, modelsDirSource: 'config' };
}

export async function isReadableDir(p: string): Promise<boolean> {
  try {
    const stat = await fs.stat(p);
    if (!stat.isDirectory()) return false;
    await fs.access(p, fs.constants.R_OK | fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
