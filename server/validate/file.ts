// Проверки по сырому glTF JSON и gltf-validator (E2, E3, E4, W1, W2).
// Не зависят от gltf-transform — работают, даже если файл не удалось разобрать целиком.
import { validateBytes, type ValidatorMessage } from 'gltf-validator';
import type { Issue, IssueTarget } from '../../shared/types.ts';
import type { GltfJson } from '../analyze/glb.ts';
import { counted } from './format.ts';

/**
 * Коды валидатора, которые не показываем.
 * MESH_PRIMITIVE_GENERATED_TANGENT_SPACE — «нет тангентов при normal map»: по приложению A ТЗ
 * Tangents при экспорте необязательны, Godot сам генерирует их при импорте.
 * IO_ERROR — в .glb это только невстроенные ресурсы, их показывает E3.
 */
const IGNORED_VALIDATOR_ISSUES = ['MESH_PRIMITIVE_GENERATED_TANGENT_SPACE', 'IO_ERROR'];
const MAX_VALIDATOR_MESSAGES = 2000;
/** Сколько сообщений валидатора показывать в подробностях. */
const MAX_DETAILS = 10;

const COMPRESSION_EXTENSIONS = ['EXT_meshopt_compression', 'KHR_meshopt_compression'];

const isExternal = (uri: string | undefined) => uri !== undefined && !uri.startsWith('data:');

function formatMessage(m: ValidatorMessage): string {
  return `${m.code}: ${m.message}${m.pointer ? ` (${m.pointer})` : ''}`;
}

/** Предупреждения валидатора бывают тысячами — группируем по коду. */
function groupedDetails(messages: ValidatorMessage[]): string[] {
  const groups = new Map<string, { count: number; first: ValidatorMessage }>();
  for (const m of messages) {
    const g = groups.get(m.code);
    if (g) g.count++;
    else groups.set(m.code, { count: 1, first: m });
  }
  return [...groups.values()]
    .slice(0, MAX_DETAILS)
    .map(({ count, first }) => (count > 1 ? `×${count} ` : '') + formatMessage(first));
}

async function validatorIssues(bytes: Uint8Array): Promise<Issue[]> {
  let report;
  try {
    report = await validateBytes(bytes, {
      writeTimestamp: false,
      maxIssues: MAX_VALIDATOR_MESSAGES,
      ignoredIssues: IGNORED_VALIDATOR_ISSUES,
      // Внешние ресурсы не загружаем: невстроенные файлы ловит E3.
    });
  } catch {
    return []; // валидатор не смог прочитать файл — это уже E1
  }
  const { numErrors, numWarnings, messages } = report.issues;
  const issues: Issue[] = [];
  if (numErrors > 0) {
    const errors = messages.filter((m) => m.severity === 0);
    issues.push({
      code: 'E2',
      level: 'error',
      message: `Валидатор glTF нашёл ${counted(numErrors, ['ошибку', 'ошибки', 'ошибок'])}`,
      details: errors.slice(0, MAX_DETAILS).map(formatMessage),
    });
  }
  if (numWarnings > 0) {
    issues.push({
      code: 'W1',
      level: 'warning',
      message: `Валидатор glTF: ${counted(numWarnings, ['предупреждение', 'предупреждения', 'предупреждений'])}`,
      details: groupedDetails(messages.filter((m) => m.severity === 1)),
    });
  }
  return issues;
}

export async function checkFile(json: GltfJson, bytes: Uint8Array): Promise<Issue[]> {
  const issues = await validatorIssues(bytes);
  const extensions = new Set([...(json.extensionsUsed ?? []), ...(json.extensionsRequired ?? [])]);

  // E3 — ресурсы не встроены.
  const externalImages: IssueTarget[] = [];
  (json.images ?? []).forEach((img, index) => {
    if (isExternal(img.uri)) externalImages.push({ kind: 'texture', name: img.name || img.uri!, index });
  });
  const externalBuffers = (json.buffers ?? []).filter((b) => isExternal(b.uri)).map((b) => b.uri!);
  if (externalImages.length > 0 || externalBuffers.length > 0) {
    const parts = [
      externalImages.length > 0 && counted(externalImages.length, ['изображение', 'изображения', 'изображений']),
      externalBuffers.length > 0 && counted(externalBuffers.length, ['буфер', 'буфера', 'буферов']),
    ].filter(Boolean);
    issues.push({
      code: 'E3',
      level: 'error',
      message: `Ресурсы не встроены в файл, а ссылаются на внешние: ${parts.join(', ')}`,
      hint: 'Экспортировать как glTF Binary (.glb) — тогда текстуры и геометрия окажутся внутри файла',
      targets: externalImages,
      details: [...(json.images ?? []).filter((i) => isExternal(i.uri)).map((i) => i.uri!), ...externalBuffers],
    });
  }

  // E4 — Draco.
  if (extensions.has('KHR_draco_mesh_compression')) {
    issues.push({
      code: 'E4',
      level: 'error',
      message: 'Геометрия сжата Draco (KHR_draco_mesh_compression)',
      hint: 'Godot не импортирует Draco — выключить Compression в настройках экспорта glTF',
    });
  }

  // W2 — другое сжатие геометрии.
  const compression = COMPRESSION_EXTENSIONS.filter((e) => extensions.has(e));
  if (compression.length > 0) {
    issues.push({
      code: 'W2',
      level: 'warning',
      message: `Геометрия сжата расширением ${compression.join(', ')}`,
      hint: 'Проверить поддержку в Godot; надёжнее экспортировать без сжатия',
    });
  }

  return issues;
}
