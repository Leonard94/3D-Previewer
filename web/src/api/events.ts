import type { ServerEvent } from '../../../shared/types.ts';

type EventListener = (event: ServerEvent) => void;
type StatusListener = (connected: boolean) => void;

/**
 * Одно WebSocket-соединение на вкладку с автоматическим переподключением.
 * После переподключения слушатели получают `connected = true` и должны перезагрузить данные:
 * события за время разрыва потеряны.
 */
const eventListeners = new Set<EventListener>();
const statusListeners = new Set<StatusListener>();
let socket: WebSocket | null = null;
let connected = false;
let retryDelay = 500;
let retryTimer: ReturnType<typeof setTimeout> | undefined;

function setConnected(value: boolean) {
  if (connected === value) return;
  connected = value;
  for (const l of statusListeners) l(value);
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${proto}//${location.host}/api/events`);
  socket = ws;
  ws.onopen = () => {
    retryDelay = 500;
    setConnected(true);
  };
  ws.onmessage = (e) => {
    let event: ServerEvent;
    try {
      event = JSON.parse(e.data as string) as ServerEvent;
    } catch {
      return;
    }
    for (const l of eventListeners) l(event);
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    setConnected(false);
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      connect();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 5000);
  };
}

function ensureConnected() {
  if (!socket && retryTimer === undefined) connect();
}

export function subscribeEvents(listener: EventListener): () => void {
  eventListeners.add(listener);
  ensureConnected();
  return () => eventListeners.delete(listener);
}

export function subscribeConnection(listener: StatusListener): () => void {
  statusListeners.add(listener);
  ensureConnected();
  listener(connected);
  return () => statusListeners.delete(listener);
}
