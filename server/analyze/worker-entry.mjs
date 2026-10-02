// Вход рабочего потока анализа. Поток не наследует загрузчик tsx от основного процесса,
// поэтому регистрируем его здесь и только потом подключаем TypeScript-модуль.
import { register } from 'tsx/esm/api';

register();
await import('./worker.ts');
