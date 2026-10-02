import type { ApiError, ConfigResponse, ConfigUpdate, ModelDetails, ModelSummary } from '../../../shared/types.ts';

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  let message = `${res.status} ${res.statusText}`;
  try {
    message = ((await res.json()) as ApiError).error || message;
  } catch {
    // тело не JSON — оставляем статус
  }
  throw new ApiRequestError(message, res.status);
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  await ensureOk(res);
  return (await res.json()) as T;
}

/** Запрос без тела ответа (204). */
async function requestEmpty(url: string, init?: RequestInit): Promise<void> {
  await ensureOk(await fetch(url, init));
}

const enc = encodeURIComponent;

export const modelFileUrl = (id: string, hash: string) => `/api/models/${enc(id)}/file?v=${hash}`;

/** Миниатюра по хешу .glb. version меняется при «Перегенерировать все» — иначе браузер покажет старую из памяти. */
export const thumbUrl = (hash: string, version = 0) => `/api/thumbs/${hash}${version ? `?v=${version}` : ''}`;

export const api = {
  getConfig: () => request<ConfigResponse>('/api/config'),
  putConfig: (body: ConfigUpdate) =>
    request<ConfigResponse>('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  listModels: () => request<ModelSummary[]>('/api/models'),
  getModel: (id: string) => request<ModelDetails>(`/api/models/${enc(id)}`),
  putThumb: (hash: string, image: Blob) =>
    requestEmpty(thumbUrl(hash), { method: 'PUT', headers: { 'Content-Type': image.type }, body: image }),
  resetThumbs: () => requestEmpty('/api/thumbs', { method: 'DELETE' }),
  reveal: (id: string) => requestEmpty(`/api/models/${enc(id)}/reveal`, { method: 'POST' }),
  openBlend: (id: string) => requestEmpty(`/api/models/${enc(id)}/open-blend`, { method: 'POST' }),
};
