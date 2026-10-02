// Копирует декодеры Draco и Basis (KTX2) из three в web/public/decoders/,
// чтобы вьювер работал без интернета. Запускается после npm install и перед dev/build.
// meshopt-декодер — обычный JS-модуль, его собирает Vite.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const libs = path.join(root, 'node_modules', 'three', 'examples', 'jsm', 'libs');
const out = path.join(root, 'web', 'public', 'decoders');

const sets = [
  { from: path.join(libs, 'draco', 'gltf'), to: path.join(out, 'draco'), files: ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'] },
  { from: path.join(libs, 'basis'), to: path.join(out, 'basis'), files: ['basis_transcoder.js', 'basis_transcoder.wasm'] },
];

let copied = 0;
for (const set of sets) {
  await fs.mkdir(set.to, { recursive: true });
  for (const file of set.files) {
    const src = path.join(set.from, file);
    const dst = path.join(set.to, file);
    const [a, b] = await Promise.all([fs.stat(src), fs.stat(dst).catch(() => null)]);
    if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) continue;
    await fs.copyFile(src, dst);
    copied++;
  }
}
if (copied) console.log(`Декодеры скопированы в web/public/decoders (${copied} файлов)`);
