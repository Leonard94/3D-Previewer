// Системные команды: «Показать в Finder» и «Открыть в Blender».
// Только execFile с аргументами — без шелла, пути не интерпретируются.
import { execFile } from 'node:child_process';
import path from 'node:path';

function run(cmd: string, args: string[], { ignoreExitCode = false } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { windowsHide: true }, (err) => {
      // explorer.exe возвращает 1 даже при успехе.
      if (err && !(ignoreExitCode && typeof err.code === 'number')) reject(err);
      else resolve();
    });
  });
}

/** Показать .glb в файловом менеджере. */
export function revealFile(file: string): Promise<void> {
  switch (process.platform) {
    case 'darwin':
      return run('open', ['-R', file]);
    case 'win32':
      return run('explorer', [`/select,${file}`], { ignoreExitCode: true });
    default:
      return run('xdg-open', [path.dirname(file)]);
  }
}

/** Открыть файл в приложении по умолчанию (для .blend — Blender). */
export function openFile(file: string): Promise<void> {
  switch (process.platform) {
    case 'darwin':
      return run('open', [file]);
    case 'win32':
      return run('explorer', [file], { ignoreExitCode: true });
    default:
      return run('xdg-open', [file]);
  }
}
