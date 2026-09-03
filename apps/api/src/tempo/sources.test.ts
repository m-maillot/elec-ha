import type { FastifyInstance } from 'fastify';
import { LocalClock } from '@elec-ha/core';
import { startFakeHa, type FakeHa } from '../../test/fake-ha.js';
import { startFakeRte, type FakeRte } from '../../test/fake-rte.js';
import { configure, fakeStatistics, testApp } from '../../test/helpers.js';
import { completeTempoDays } from './sources.js';

const clock = new LocalClock();

function parseSse(body: string) {
  return body
    .split('\n\n')
    .filter((b) => b.includes('data:'))
    .map((b) =>
      JSON.parse(
        b
          .split('\n')
          .find((l) => l.startsWith('data:'))!
          .slice(5),
      ),
    );
}

describe('complétion des couleurs Tempo', () => {
  let app: FastifyInstance;
  let ha: FakeHa;
  let rte: FakeRte;
  afterEach(async () => {
    await app?.close();
    await ha?.close();
    await rte?.close();
  });

  it('source RTE : complète la veille + la période, sans redemander les dates connues', async () => {
    rte = await startFakeRte({ colorOf: (d) => (d === '2026-01-15' ? 'red' : 'blue') });
    ha = await startFakeHa({ statistics: fakeStatistics(() => 1) });
    app = await testApp({ rteBaseUrl: rte.url });
    await configure(app, ha);
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { tempo: { source: 'rte', rteClientId: 'cid', rteClientSecret: 'csecret' } },
    });
    await app.inject({
      method: 'POST',
      url: '/api/tempo/days',
      payload: { csv: '2026-01-15;blanc' },
    });

    const r = await completeTempoDays({
      db: app.ctx.db,
      clock,
      settings: app.ctx.settings,
      from: '2026-01-14',
      to: '2026-01-17',
      today: '2026-03-01',
      rteBaseUrl: rte.url,
    });
    expect(r).toEqual({ source: 'rte', fetched: 4, missing: 0 });
    // 13 → 14 puis 16 → 17 : deux plages, le 15 (CSV) n'est pas redemandé ni écrasé
    expect(rte.calendarRequests.map((q) => q.start.slice(0, 10))).toEqual([
      '2026-01-13',
      '2026-01-16',
    ]);
    const days = (
      await app.inject({ method: 'GET', url: '/api/tempo/days?from=2026-01-13&to=2026-01-17' })
    ).json().days;
    expect(
      days.map(
        (d: { date: string; color: string; source: string }) => `${d.date}:${d.color}:${d.source}`,
      ),
    ).toEqual([
      '2026-01-13:blue:rte',
      '2026-01-14:blue:rte',
      '2026-01-15:white:csv',
      '2026-01-16:blue:rte',
      '2026-01-17:blue:rte',
    ]);

    const again = await completeTempoDays({
      db: app.ctx.db,
      clock,
      settings: app.ctx.settings,
      from: '2026-01-14',
      to: '2026-01-17',
      today: '2026-03-01',
      rteBaseUrl: rte.url,
    });
    expect(again).toEqual({ source: 'rte', fetched: 0, missing: 0 });
    expect(rte.calendarRequests).toHaveLength(2);
  });

  it('ne demande pas les dates futures et signale ce qui reste inconnu', async () => {
    rte = await startFakeRte({ colorOf: () => 'blue' });
    ha = await startFakeHa();
    app = await testApp({ rteBaseUrl: rte.url });
    await configure(app, ha);
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { tempo: { source: 'rte', rteClientId: 'cid', rteClientSecret: 'csecret' } },
    });
    const r = await completeTempoDays({
      db: app.ctx.db,
      clock,
      settings: app.ctx.settings,
      from: '2026-03-01',
      to: '2026-03-10',
      today: '2026-03-03',
      rteBaseUrl: rte.url,
    });
    expect(r).toEqual({ source: 'rte', fetched: 5, missing: 6 }); // 28/02 → 04/03 chargés ; 05 → 10/03 inconnus
    expect(rte.calendarRequests[0]?.end.slice(0, 10)).toBe('2026-03-05');
  });

  it('source RTE non configurée ou en erreur : la sync reste valide', async () => {
    rte = await startFakeRte({ clientSecret: 'other' });
    ha = await startFakeHa();
    app = await testApp({ rteBaseUrl: rte.url });
    await configure(app, ha);
    const none = await completeTempoDays({
      db: app.ctx.db,
      clock,
      settings: app.ctx.settings,
      from: '2026-01-14',
      to: '2026-01-14',
      today: '2026-03-01',
      rteBaseUrl: rte.url,
    });
    expect(none).toMatchObject({
      source: 'rte',
      fetched: 0,
      missing: 2,
      error: expect.stringMatching(/non configurés/),
    });
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { tempo: { rteClientId: 'cid', rteClientSecret: 'wrong' } },
    });
    const bad = await completeTempoDays({
      db: app.ctx.db,
      clock,
      settings: app.ctx.settings,
      from: '2026-01-14',
      to: '2026-01-14',
      today: '2026-03-01',
      rteBaseUrl: rte.url,
    });
    expect(bad).toMatchObject({ fetched: 0, missing: 2, error: expect.stringMatching(/refusés/) });
  });

  it('POST /api/data/sync enchaîne consommation puis couleurs', async () => {
    rte = await startFakeRte({ colorOf: () => 'blue' });
    ha = await startFakeHa({ statistics: fakeStatistics(() => 1) });
    app = await testApp({ rteBaseUrl: rte.url });
    await configure(app, ha);
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { tempo: { rteClientId: 'cid', rteClientSecret: 'csecret' } },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/data/sync?from=2026-01-01&to=2026-01-02',
    });
    const events = parseSse(res.body);
    expect(events.some((e) => e.type === 'progress' && e.step === 'tempo')).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      consumption: { hoursStored: 48 },
      tempo: { source: 'rte', fetched: 3, missing: 0 },
    });
  });

  it('POST /api/tempo/rte/test renvoie la couleur du jour', async () => {
    const today = clock.toLocal(Date.now()).date;
    rte = await startFakeRte({ colorOf: (d) => (d === today ? 'white' : undefined) });
    app = await testApp({ rteBaseUrl: rte.url });
    const res = await app.inject({
      method: 'POST',
      url: '/api/tempo/rte/test',
      payload: { clientId: 'cid', clientSecret: 'csecret' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true, date: today, color: 'white' });
    const bad = await app.inject({
      method: 'POST',
      url: '/api/tempo/rte/test',
      payload: { clientId: 'cid', clientSecret: 'nope' },
    });
    expect(bad.statusCode).toBe(401);
    expect(bad.json().code).toBe('rte_unauthorized');
    const missing = await app.inject({ method: 'POST', url: '/api/tempo/rte/test', payload: {} });
    expect(missing.statusCode).toBe(400);
  });
});
