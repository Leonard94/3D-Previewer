// Связь инспектора со сценой в другой вкладке. Сцена живёт в памяти своей вкладки, поэтому
// «Добавить в сцену» сначала спрашивает открытую сцену, и только если её нет — открывает новую.

const CHANNEL = 'model-preview-scene';
/** Сколько ждать ответа открытой сцены. Меньше секунды — иначе браузер заблокирует новую вкладку. */
const ACK_TIMEOUT_MS = 300;

type Message = { type: 'add'; id: string; req: string } | { type: 'ack'; req: string };

/** Вкладка сцены принимает модели из других вкладок. Возвращает отписку. */
export function listenSceneRequests(onAdd: (modelId: string) => void): () => void {
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e: MessageEvent<Message>) => {
    if (e.data.type !== 'add') return;
    onAdd(e.data.id);
    channel.postMessage({ type: 'ack', req: e.data.req } satisfies Message);
  };
  return () => channel.close();
}

/**
 * Добавляет модель в открытую сцену; если сцены нет — открывает её в новой вкладке.
 * Вызывать из обработчика клика. 'sent' — модель ушла в открытую сцену.
 */
export function addToScene(modelId: string): Promise<'sent' | 'opened' | 'blocked'> {
  const channel = new BroadcastChannel(CHANNEL);
  const req = `${Date.now()}-${Math.random()}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      channel.close();
      const tab = window.open(`/scene?add=${encodeURIComponent(modelId)}`, '_blank');
      resolve(tab ? 'opened' : 'blocked');
    }, ACK_TIMEOUT_MS);
    channel.onmessage = (e: MessageEvent<Message>) => {
      if (e.data.type !== 'ack' || e.data.req !== req) return;
      clearTimeout(timer);
      channel.close();
      resolve('sent');
    };
    channel.postMessage({ type: 'add', id: modelId, req } satisfies Message);
  });
}
