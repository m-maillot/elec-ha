import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { eachDay, LocalClock, type TempoColor } from '@elec-ha/core';

export interface FakeRteOptions {
  clientId?: string;
  clientSecret?: string;
  /** Couleur d'une date, `undefined` = non publiée. */
  colorOf?: (date: string) => TempoColor | undefined;
  /** Nombre de requêtes calendrier avant de répondre 429. */
  quota?: number;
  expiresIn?: number;
}

export interface FakeRte {
  url: string;
  tokenRequests: number;
  calendarRequests: Array<{ start: string; end: string }>;
  close(): Promise<void>;
}

const clock = new LocalClock();
const VALUE: Record<TempoColor, string> = { blue: 'BLUE', white: 'WHITE', red: 'RED' };

/** Serveur RTE minimal : `/token/oauth/` (Basic) et `tempo_like_calendars` (Bearer). */
export async function startFakeRte(opts: FakeRteOptions = {}): Promise<FakeRte> {
  const clientId = opts.clientId ?? 'cid';
  const clientSecret = opts.clientSecret ?? 'csecret';
  const token = 'rte-access-token';
  const state = { tokenRequests: 0, calendarRequests: [] as Array<{ start: string; end: string }> };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'POST' && url.pathname === '/token/oauth/') {
      state.tokenRequests++;
      const expected = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
      if (req.headers.authorization !== expected) return json(401, { error: 'invalid_client' });
      return json(200, {
        access_token: token,
        token_type: 'Bearer',
        expires_in: opts.expiresIn ?? 7200,
      });
    }
    if (url.pathname === '/open_api/tempo_like_supply_contract/v1/tempo_like_calendars') {
      if (req.headers.authorization !== `Bearer ${token}`)
        return json(401, { error: 'unauthorized' });
      const start = url.searchParams.get('start_date') ?? '';
      const end = url.searchParams.get('end_date') ?? '';
      state.calendarRequests.push({ start, end });
      if (opts.quota !== undefined && state.calendarRequests.length > opts.quota) {
        return json(429, { error: 'quota' });
      }
      const from = clock.toLocal(Date.parse(start)).date;
      const toExclusive = clock.toLocal(Date.parse(end)).date;
      const values: unknown[] = [];
      for (const d of eachDay(from, toExclusive)) {
        if (d === toExclusive) break;
        const color = opts.colorOf?.(d);
        if (!color) continue;
        const dayStart = clock.localMidnightUtcMs(d) + 6 * 3_600_000;
        values.push({
          start_date: new Date(dayStart).toISOString(),
          end_date: new Date(dayStart + 24 * 3_600_000).toISOString(),
          value: VALUE[color],
          updated_date: new Date(dayStart).toISOString(),
        });
      }
      return json(200, { tempo_like_calendars: { start_date: start, end_date: end, values } });
    }
    json(404, { error: 'not_found' });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    get tokenRequests() {
      return state.tokenRequests;
    },
    calendarRequests: state.calendarRequests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
