import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
// @ts-expect-error — у draco3dgltf нет типов
import draco3d from 'draco3dgltf';
import { MeshoptDecoder } from 'meshoptimizer';

let ioPromise: Promise<NodeIO> | null = null;

/** NodeIO со всеми расширениями; Draco и meshopt зарегистрированы — сжатые файлы тоже читаются. */
export function getIO(): Promise<NodeIO> {
  ioPromise ??= (async () => {
    await MeshoptDecoder.ready;
    const decoder = await (draco3d as { createDecoderModule: () => Promise<unknown> }).createDecoderModule();
    return new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'draco3d.decoder': decoder,
      'meshopt.decoder': MeshoptDecoder,
    });
  })();
  return ioPromise;
}
