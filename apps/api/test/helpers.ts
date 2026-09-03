import type { FastifyInstance } from 'fastify';
import { TARIF_BLEU_2026_08 } from '@elec-ha/core';
import { buildApp } from '../src/app.js';
import { openDatabase } from '../src/db/index.js';

export const APP_SECRET = 'test-secret-with-enough-length';

export async function testApp(options: { rteBaseUrl?: string } = {}): Promise<FastifyInstance> {
  return buildApp({
    config: { appSecret: APP_SECRET, webDistDir: undefined },
    db: openDatabase(':memory:'),
    logger: false,
    ...options,
  });
}

/** Configure HA + grille 6 kVA + créneaux 22h–6h. */
export async function configure(
  app: FastifyInstance,
  ha: { url: string; token: string; entityId?: string },
): Promise<void> {
  const res = await app.inject({
    method: 'PUT',
    url: '/api/settings',
    payload: {
      ha: { url: ha.url, token: ha.token, entityId: ha.entityId ?? 'sensor.energy' },
      subscribedPowerKva: 6,
      currentOption: 'base',
      grid: TARIF_BLEU_2026_08[6],
      offpeak: {
        hphc: [{ startMin: 22 * 60, endMin: 6 * 60 }],
        tempo: [{ startMin: 22 * 60, endMin: 6 * 60 }],
      },
    },
  });
  if (res.statusCode !== 200) throw new Error(`configure: ${res.body}`);
}

/** Buckets HA horaires avec `sum` cumulé et `change`, `kwhAt(startMs)` par heure. */
export function fakeStatistics(kwhAt: (startMs: number) => number | null, withChange = true) {
  return (_id: string, startMs: number, endMs: number) => {
    const out: Array<Record<string, unknown>> = [];
    let sum = 1000;
    for (let t = startMs; t < endMs; t += 3_600_000) {
      const kwh = kwhAt(t);
      if (kwh === null) continue;
      sum += kwh;
      out.push({ start: t, end: t + 3_600_000, sum, ...(withChange ? { change: kwh } : {}) });
    }
    return out;
  };
}
