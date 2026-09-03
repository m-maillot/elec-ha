import type {
  ConsumptionResponse,
  Granularity,
  HaEntitiesResponse,
  HaTestRequest,
  HaTestResponse,
  RteTestRequest,
  RteTestResponse,
  SettingsDto,
  SettingsUpdateDto,
  SimulateRequest,
  SimulateResponse,
  SyncEvent,
  TempoCsvImportResult,
  TempoDaysResponse,
} from '@elec-ha/core';
import { t } from '../i18n/fr.js';

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** Message utilisateur : libellé connu pour le code, sinon message serveur. */
  get userMessage(): string {
    return t.errors.codes[this.code] ?? this.message;
  }
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.userMessage;
  if (err instanceof TypeError) return t.errors.network;
  if (err instanceof Error) return err.message;
  return t.errors.generic;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    let code = 'http_error';
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { code?: string; error?: string };
      code = body.code ?? code;
      message = body.error ?? message;
    } catch {
      /* corps non JSON */
    }
    throw new ApiClientError(res.status, code, message);
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

export const api = {
  getSettings: () => request<SettingsDto>('/api/settings'),
  updateSettings: (patch: SettingsUpdateDto) =>
    request<SettingsDto>('/api/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  testHa: (body: HaTestRequest) => request<HaTestResponse>('/api/ha/test', json(body)),
  getHaEntities: () => request<HaEntitiesResponse>('/api/ha/entities'),
  testRte: (body: RteTestRequest) => request<RteTestResponse>('/api/tempo/rte/test', json(body)),
  importTempoCsv: (csv: string, overwrite: boolean) =>
    request<TempoCsvImportResult>('/api/tempo/days', json({ csv, overwrite })),
  getTempoDays: (from: string, to: string) =>
    request<TempoDaysResponse>(`/api/tempo/days?from=${from}&to=${to}`),
  simulate: (body: SimulateRequest) => request<SimulateResponse>('/api/simulate', json(body)),
  getConsumption: (from: string, to: string, granularity: Granularity) =>
    request<ConsumptionResponse>(
      `/api/consumption?from=${from}&to=${to}&granularity=${granularity}`,
    ),

  /** Synchronisation avec progression SSE ; résout sur l'événement `done`, rejette sur `error`. */
  async sync(from: string, to: string, onEvent: (e: SyncEvent) => void): Promise<void> {
    const res = await fetch(`/api/data/sync?from=${from}&to=${to}`, { method: 'POST' });
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => ({}))) as { code?: string; error?: string };
      throw new ApiClientError(
        res.status,
        body.code ?? 'http_error',
        body.error ?? `HTTP ${res.status}`,
      );
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finished = false;
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const data = block
          .split('\n')
          .find((l) => l.startsWith('data:'))
          ?.slice(5)
          .trim();
        if (!data) continue;
        const event = JSON.parse(data) as SyncEvent;
        onEvent(event);
        if (event.type === 'error') throw new ApiClientError(502, event.code, event.message);
        if (event.type === 'done') finished = true;
      }
    }
  },
};
