import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';

export interface FakeHaOptions {
  token?: string;
  version?: string;
  statisticIds?: Array<Record<string, unknown>>;
  states?: Array<Record<string, unknown>>;
  /** Génère les buckets horaires `[startMs, endMs[` (start epoch ms). */
  statistics?: (
    statisticId: string,
    startMs: number,
    endMs: number,
  ) => Array<Record<string, unknown>>;
}

export interface FakeHa {
  url: string;
  token: string;
  /** Messages WS reçus (hors auth). */
  received: Array<Record<string, unknown>>;
  connections: number;
  close(): Promise<void>;
}

/** Serveur Home Assistant minimal : REST `/api/config` + WebSocket `/api/websocket` avec auth. */
export async function startFakeHa(opts: FakeHaOptions = {}): Promise<FakeHa> {
  const token = opts.token ?? 'test-token';
  const version = opts.version ?? '2026.8.1';
  const received: Array<Record<string, unknown>> = [];
  let connections = 0;

  const server = http.createServer((req, res) => {
    const auth = req.headers.authorization;
    if (auth !== `Bearer ${token}`) {
      res.writeHead(401).end(JSON.stringify({ message: 'Unauthorized' }));
      return;
    }
    if (req.url === '/api/' || req.url === '/api/config') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'API running.', version }));
      return;
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ server, path: '/api/websocket' });
  wss.on('connection', (ws: WebSocket) => {
    connections++;
    ws.send(JSON.stringify({ type: 'auth_required', ha_version: version }));
    ws.on('message', (raw) => {
      const text = Array.isArray(raw)
        ? Buffer.concat(raw).toString('utf8')
        : Buffer.from(raw as ArrayBuffer).toString('utf8');
      const msg = JSON.parse(text) as Record<string, unknown>;
      if (msg['type'] === 'auth') {
        if (msg['access_token'] === token)
          ws.send(JSON.stringify({ type: 'auth_ok', ha_version: version }));
        else ws.send(JSON.stringify({ type: 'auth_invalid', message: 'Invalid access token' }));
        return;
      }
      received.push(msg);
      const reply = (result: unknown) =>
        ws.send(JSON.stringify({ id: msg['id'], type: 'result', success: true, result }));
      switch (msg['type']) {
        case 'recorder/list_statistic_ids':
          reply(opts.statisticIds ?? []);
          break;
        case 'get_states':
          reply(opts.states ?? []);
          break;
        case 'recorder/statistics_during_period': {
          const ids = msg['statistic_ids'] as string[];
          const startMs = Date.parse(msg['start_time'] as string);
          const endMs = Date.parse(msg['end_time'] as string);
          const out: Record<string, unknown> = {};
          for (const id of ids) out[id] = opts.statistics?.(id, startMs, endMs) ?? [];
          reply(out);
          break;
        }
        default:
          ws.send(
            JSON.stringify({
              id: msg['id'],
              type: 'result',
              success: false,
              error: { code: 'unknown_command', message: `Unknown command ${String(msg['type'])}` },
            }),
          );
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    token,
    received,
    get connections() {
      return connections;
    },
    close: () =>
      new Promise<void>((resolve) => {
        wss.clients.forEach((c) => c.terminate());
        wss.close(() => server.close(() => resolve()));
      }),
  };
}
