// npm run fetch:hdri — скачивает HDRI для пресетов света в web/public/hdri/ (один раз).
// Все карты — CC0 с Poly Haven, 2K .hdr. Любую можно заменить своей:
// положите файл с тем же именем (day.hdr, night.hdr, studio.hdr).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const outDir = path.join(root, 'web', 'public', 'hdri');

const HDRIS = [
  { file: 'day.hdr', slug: 'kloofendal_48d_partly_cloudy_puresky', preset: 'День' },
  { file: 'night.hdr', slug: 'moonless_golf', preset: 'Ночь' },
  { file: 'studio.hdr', slug: 'studio_small_09', preset: 'Студийный' },
];

const urlFor = (slug: string) => `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/${slug}_2k.hdr`;
const pageFor = (slug: string) => `https://polyhaven.com/a/${slug}`;

async function exists(p: string): Promise<boolean> {
  try {
    return (await fs.stat(p)).size > 0;
  } catch {
    return false;
  }
}

async function download(url: string, target: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  const tmp = `${target}.part`;
  const fh = await fs.open(tmp, 'w');
  let loaded = 0;
  let lastPct = -1;
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      await fh.write(chunk);
      loaded += chunk.length;
      const pct = total ? Math.floor((loaded / total) * 100) : -1;
      if (pct !== lastPct && pct % 10 === 0) {
        process.stdout.write(` ${pct}%`);
        lastPct = pct;
      }
    }
  } finally {
    await fh.close();
  }
  await fs.rename(tmp, target);
}

await fs.mkdir(outDir, { recursive: true });
const failed: typeof HDRIS = [];

for (const h of HDRIS) {
  const target = path.join(outDir, h.file);
  if (await exists(target)) {
    console.log(`✓ ${h.file} уже есть (${h.preset})`);
    continue;
  }
  process.stdout.write(`↓ ${h.file} ← ${h.slug} (${h.preset})…`);
  try {
    await download(urlFor(h.slug), target);
    console.log(' готово');
  } catch (err) {
    console.log(` не удалось: ${(err as Error).message}`);
    await fs.rm(`${target}.part`, { force: true });
    failed.push(h);
  }
}

if (failed.length) {
  console.log('\nНет сети или Poly Haven недоступен. Скачайте вручную (2K, формат HDR) и положите так:');
  for (const h of failed) {
    console.log(`  ${path.relative(root, path.join(outDir, h.file))}  ←  ${urlFor(h.slug)}`);
    console.log(`  ${' '.repeat(path.relative(root, path.join(outDir, h.file)).length)}     (страница: ${pageFor(h.slug)})`);
  }
  console.log('Без HDRI пресеты «День», «Ночь» и «Студийный» используют запасное окружение (RoomEnvironment).');
  process.exitCode = 1;
} else {
  console.log(`\nHDRI на месте: ${path.relative(root, outDir)}/`);
}
