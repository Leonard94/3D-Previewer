// npm run dev: сервер (tsx watch) и фронт (Vite с HMR) одновременно.
// Аргументы пробрасываются серверу: npm run dev -- --models-dir ~/game/assets/models
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const bin = (name: string) => path.join(root, 'node_modules', '.bin', name);
const args = process.argv.slice(2);

const colors = { server: '\x1b[36m', web: '\x1b[35m' } as const;
const reset = '\x1b[0m';

function run(name: keyof typeof colors, cmd: string, cmdArgs: string[]): ChildProcess {
  const child = spawn(cmd, cmdArgs, { cwd: root, env: { ...process.env, FORCE_COLOR: '1' } });
  const prefix = `${colors[name]}[${name}]${reset} `;
  const pipe = (stream: NodeJS.ReadableStream, out: NodeJS.WriteStream) => {
    let buf = '';
    stream.on('data', (chunk: Buffer) => {
      buf += chunk.toString();
      const lines = buf.split('\n');
      buf = lines.pop()!;
      for (const line of lines) out.write(prefix + line + '\n');
    });
  };
  pipe(child.stdout!, process.stdout);
  pipe(child.stderr!, process.stderr);
  child.on('exit', (code) => {
    console.log(`${prefix}завершён (код ${code ?? 0})`);
    shutdown(code ?? 0);
  });
  return child;
}

const children = [
  run('server', bin('tsx'), ['watch', '--clear-screen=false', 'server/index.ts', ...args]),
  run('web', bin('vite'), []),
];

let stopping = false;
function shutdown(code: number) {
  if (stopping) return;
  stopping = true;
  for (const c of children) if (c.exitCode === null) c.kill('SIGTERM');
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
