import type { FastifyInstance } from 'fastify';
import { LocalClock, addDays } from '@elec-ha/core';
import { startFakeHa, type FakeHa } from '../../test/fake-ha.js';
import { configure, fakeStatistics, testApp } from '../../test/helpers.js';
import { planChunks, selectDaysToFetch, syncConsumption } from './sync.js';
import { HaClient } from '../ha/client.js';
import { consumptionHours } from '../db/schema.js';
import { loadBuckets } from './repository.js';

const clock = new LocalClock();

describe('planChunks', () => {
  it('regroupe les jours contigus et découpe en tranches de 31 jours', () => {
    const days = ['2026-01-01', '2026-01-02', '2026-01-05'];
    expect(planChunks(days)).toEqual([
      { from: '2026-01-01', to: '2026-01-02' },
      { from: '2026-01-05', to: '2026-01-05' },
    ]);
    const long = Array.from({ length: 65 }, (_, i) => addDays('2026-01-01', i));
    expect(planChunks(long)).toEqual([
      { from: '2026-01-01', to: '2026-01-31' },
      { from: '2026-02-01', to: '2026-03-03' },
      { from: '2026-03-04', to: '2026-03-06' },
    ]);
    expect(planChunks([])).toEqual([]);
  });
});

function parseSse(body: string) {
  return body
    .split('\n\n')
    .filter((b) => b.includes('data:'))
    .map((b) => JSON.parse(b.split('\n').find((l) => l.startsWith('data:'))!.slice(5)));
}

describe('synchronisation de la consommation', () => {
  let app: FastifyInstance;
  let ha: FakeHa;
  beforeEach(async () => {
    app = await testApp();
  });
  afterEach(async () => {
    await app.close();
    await ha?.close();
  });

  it('charge par tranches, calcule kwh depuis change, et ne redemande que les 7 derniers jours', async () => {
    ha = await startFakeHa({ statistics: fakeStatistics(() => 0.5) });
    await configure(app, ha);
    const client = new HaClient(ha.url, ha.token);
    const progress: string[] = [];
    const r1 = await syncConsumption({
      db: app.ctx.db,
      clock,
      ha: client,
      statisticIds: ['sensor.energy'],
      from: '2026-01-01',
      to: '2026-02-15',
      today: '2026-03-01',
      onProgress: (d, t, m) => progress.push(`${d}/${t} ${m}`),
    });
    expect(r1).toEqual({ chunks: 2, hoursStored: 46 * 24, daysRequested: 46 });
    expect(progress[0]).toBe('0/2 Chargement du 2026-01-01 au 2026-01-31');
    expect(progress.at(-1)).toBe('2/2 Tranche 2/2 chargée');
    expect(ha.received.filter((m) => m['type'] === 'recorder/statistics_during_period')).toHaveLength(2);
    expect(app.ctx.db.select().from(consumptionHours).all()).toHaveLength(46 * 24);

    // Deuxième passe : rien à recharger sauf si dans les 7 derniers jours
    const r2 = await syncConsumption({ db: app.ctx.db, clock, ha: client, statisticIds: ['sensor.energy'], from: '2026-01-01', to: '2026-02-15', today: '2026-03-01' });
    expect(r2).toEqual({ chunks: 0, hoursStored: 0, daysRequested: 0 });
    const r3 = await syncConsumption({ db: app.ctx.db, clock, ha: client, statisticIds: ['sensor.energy'], from: '2026-01-01', to: '2026-02-15', today: '2026-02-16' });
    expect(r3.daysRequested).toBe(6); // 10/02 → 15/02
  });

  it('retombe sur la différence des sum quand change est absent', async () => {
    ha = await startFakeHa({ statistics: fakeStatistics((t) => (new Date(t).getUTCHours() % 2 === 0 ? 1 : 2), false) });
    await configure(app, ha);
    const client = new HaClient(ha.url, ha.token);
    const r = await syncConsumption({ db: app.ctx.db, clock, ha: client, statisticIds: ['sensor.energy'], from: '2026-01-10', to: '2026-01-10', today: '2026-03-01' });
    // Le premier bucket (23:00 UTC) n'a pas de précédent : 23 heures stockées, à partir de 00:00 UTC
    expect(r.hoursStored).toBe(23);
    const rows = app.ctx.db.select().from(consumptionHours).all();
    expect(rows.map((x) => x.kwh).slice(0, 4)).toEqual([1, 2, 1, 2]);

    // La tranche suivante utilise le sum du cache pour son premier bucket
    const r2 = await syncConsumption({ db: app.ctx.db, clock, ha: client, statisticIds: ['sensor.energy'], from: '2026-01-11', to: '2026-01-11', today: '2026-03-01' });
    expect(r2.hoursStored).toBe(24);
  });

  it('considère les jours incomplets comme à recharger', async () => {
    ha = await startFakeHa({ statistics: fakeStatistics((t) => (new Date(t).getUTCHours() === 12 ? null : 1)) });
    await configure(app, ha);
    await syncConsumption({ db: app.ctx.db, clock, ha: new HaClient(ha.url, ha.token), statisticIds: ['sensor.energy'], from: '2026-01-10', to: '2026-01-11', today: '2026-03-01' });
    expect(selectDaysToFetch(app.ctx.db, clock, ['sensor.energy'], '2026-01-10', '2026-01-11', '2026-03-01')).toEqual(['2026-01-10', '2026-01-11']);
  });

  it('additionne plusieurs entités heure par heure (index HP + index HC)', async () => {
    ha = await startFakeHa({
      statistics: (id, startMs, endMs) =>
        fakeStatistics((t) => {
          const h = clock.toLocal(t).minuteOfDay / 60;
          const hc = h < 6 || h >= 22;
          return id === 'sensor.linky_hc' ? (hc ? 0.5 : 0) : hc ? 0 : 1;
        })(id, startMs, endMs),
    });
    await configure(app, { url: ha.url, token: ha.token, entityIds: ['sensor.linky_hp', 'sensor.linky_hc'] });
    const r = await syncConsumption({
      db: app.ctx.db,
      clock,
      ha: new HaClient(ha.url, ha.token),
      statisticIds: ['sensor.linky_hp', 'sensor.linky_hc'],
      from: '2026-01-10',
      to: '2026-01-10',
      today: '2026-03-01',
    });
    expect(r).toEqual({ chunks: 1, hoursStored: 48, daysRequested: 1 });
    expect(ha.received.filter((m) => m['type'] === 'recorder/statistics_during_period')).toHaveLength(1);
    const buckets = loadBuckets(app.ctx.db, clock, ['sensor.linky_hp', 'sensor.linky_hc'], '2026-01-10', '2026-01-10');
    expect(buckets).toHaveLength(24);
    expect(buckets.reduce((a, b) => a + (b.kwh ?? 0), 0)).toBeCloseTo(8 * 0.5 + 16 * 1, 9);
    // Une entité retirée de la configuration n'est plus comptée
    expect(loadBuckets(app.ctx.db, clock, ['sensor.linky_hc'], '2026-01-10', '2026-01-10').reduce((a, b) => a + (b.kwh ?? 0), 0)).toBeCloseTo(4, 9);
  });

  it('expose la progression en SSE via POST /api/data/sync', async () => {
    ha = await startFakeHa({ statistics: fakeStatistics(() => 1) });
    await configure(app, ha);
    const res = await app.inject({ method: 'POST', url: '/api/data/sync?from=2026-01-01&to=2026-01-02' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/event-stream/);
    const events = parseSse(res.body);
    expect(events[0]).toMatchObject({ type: 'progress', done: 0, total: 1 });
    const done = events.at(-1);
    expect(done).toMatchObject({ type: 'done', consumption: { chunks: 1, hoursStored: 48 } });
    expect((await app.inject({ method: 'GET', url: '/api/settings' })).json().lastSyncAt).toBe(done.lastSyncAt);
  });

  it('émet un événement error si HA refuse le token', async () => {
    ha = await startFakeHa({ statistics: fakeStatistics(() => 1) });
    await configure(app, { url: ha.url, token: 'wrong' });
    const res = await app.inject({ method: 'POST', url: '/api/data/sync?from=2026-01-01&to=2026-01-02' });
    const events = parseSse(res.body);
    expect(events.at(-1)).toMatchObject({ type: 'error', code: 'ha_unauthorized' });
  });

  it('refuse la sync sans configuration', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/data/sync?from=2026-01-01&to=2026-01-02' });
    expect(res.statusCode).toBe(409);
  });
});
