import type { FastifyInstance } from 'fastify';
import { startFakeHa, type FakeHa } from '../../test/fake-ha.js';
import { configure, fakeStatistics, testApp } from '../../test/helpers.js';
import { LocalClock } from '@elec-ha/core';

const clock = new LocalClock();

/** Reproduit l'exemple §5.6 : jour Tempo du 15/01 = 4 kWh HP (06–22 h) + 6 kWh HC (22–06 h). */
function spec56(t: number): number {
  const { date, minuteOfDay } = clock.toLocal(t);
  const h = minuteOfDay / 60;
  const tempoDay =
    h < 6
      ? '2026-01-15' === date
        ? '2026-01-14'
        : date === '2026-01-16'
          ? '2026-01-15'
          : date
      : date;
  if (tempoDay !== '2026-01-15') return 0;
  return h >= 6 && h < 22 ? 4 / 16 : 6 / 8;
}

describe('POST /api/simulate et GET /api/consumption', () => {
  let app: FastifyInstance;
  let ha: FakeHa;
  beforeEach(async () => {
    app = await testApp();
    ha = await startFakeHa({ statistics: fakeStatistics(spec56) });
    await configure(app, ha);
    await app.inject({
      method: 'POST',
      url: '/api/tempo/days',
      payload: { csv: '2026-01-14;bleu\n2026-01-15;rouge\n2026-01-16;bleu' },
    });
    await app.inject({ method: 'POST', url: '/api/data/sync?from=2026-01-15&to=2026-01-16' });
  });
  afterEach(async () => {
    await app.close();
    await ha.close();
  });

  it('simule sur le cache avec les couleurs importées en CSV', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/simulate',
      payload: { from: '2026-01-15', to: '2026-01-16' },
    });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.kwhTotal).toBeCloseTo(10, 6);
    expect(r.base.consumption).toBeCloseTo(2.001, 6);
    expect(r.hphc.consumption).toBeCloseTo(1.8102, 6);
    expect(r.tempo.consumption).toBeCloseTo(3.887, 6);
    expect(r.tempo.byColor.red.days).toBe(1);
    expect(r.tempo.partial).toBe(false);
    expect(r.base.deltaVsCurrent).toBeNull();
    expect(r.smoothingApplied).toBe(false);
    expect(r.warnings).toEqual([]);

    const asTempo = await app.inject({
      method: 'POST',
      url: '/api/simulate',
      payload: { from: '2026-01-15', to: '2026-01-16', currentOption: 'tempo' },
    });
    expect(asTempo.json().tempo.deltaVsCurrent).toBeNull();
  });

  it('applique le lissage des jours rouges quand il est demandé', async () => {
    // Étend le cache pour disposer de jours de référence complets (14/01 et 16/01)
    await app.inject({ method: 'POST', url: '/api/data/sync?from=2026-01-14&to=2026-01-17' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/simulate',
      payload: { from: '2026-01-15', to: '2026-01-16', smoothing: { enabled: true } },
    });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.smoothingApplied).toBe(true);
    // Seule référence disponible : le 16/01 (bleu, 0 kWh) → profil nul, 10 kWh retirés
    expect(r.smoothing.periods).toEqual([
      {
        days: ['2026-01-15'],
        referencesBefore: ['2026-01-14'],
        referencesAfter: ['2026-01-16'],
        smoothed: true,
      },
    ]);
    expect(r.smoothing.redistributedKwh).toBeCloseTo(-10, 6);
    expect(r.smoothing.costWithoutSmoothing).toBeCloseTo(3.887 + (189.6 * 2) / 365, 6);
    expect(r.tempo.consumption).toBeCloseTo(0, 9);
    expect(r.base.consumption).toBeCloseTo(2.001, 6); // Base inchangée
    expect(r.smoothing.substitutedHours).toHaveLength(24);
  });

  it('signale les heures manquantes hors du cache', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/simulate',
      payload: { from: '2026-01-15', to: '2026-01-17' },
    });
    const r = res.json();
    expect(r.hours).toEqual({ expected: 72, present: 48, missing: 24 });
    expect(r.missingDays).toEqual(['2026-01-17']);
    expect(r.warnings.map((w: { code: string }) => w.code)).toContain('missing_hours');
  });

  it('refuse sans grille', async () => {
    const empty = await testApp();
    const res = await empty.inject({
      method: 'POST',
      url: '/api/simulate',
      payload: { from: '2026-01-15', to: '2026-01-16' },
    });
    expect(res.statusCode).toBe(409);
    await empty.close();
  });

  it('GET /api/consumption renvoie la maille heure enrichie et les agrégats', async () => {
    const hour = await app.inject({
      method: 'GET',
      url: '/api/consumption?from=2026-01-15&to=2026-01-16',
    });
    expect(hour.statusCode).toBe(200);
    const points = hour.json().points;
    expect(points).toHaveLength(48);
    expect(points[0]).toMatchObject({
      key: '2026-01-15T00:00',
      kwh: 0,
      hcShareHphc: 1,
      hcShareTempo: 1,
      tempoColor: 'blue',
    });
    expect(points[6]).toMatchObject({
      key: '2026-01-15T06:00',
      kwh: 0.25,
      hcShareHphc: 0,
      tempoColor: 'red',
    });
    expect(points[24 + 3]).toMatchObject({ key: '2026-01-16T03:00', kwh: 0.75, tempoColor: 'red' });

    const day = await app.inject({
      method: 'GET',
      url: '/api/consumption?from=2026-01-15&to=2026-01-17&granularity=day',
    });
    const days = day.json().points;
    expect(days).toHaveLength(3);
    expect(days[0]).toMatchObject({ key: '2026-01-15', missingHours: 0, tempoColor: 'red' });
    expect(days[0].kwh).toBeCloseTo(4 + (6 / 8) * 2, 6);
    expect(days[2]).toMatchObject({ key: '2026-01-17', kwh: null, missingHours: 24 });

    const month = await app.inject({
      method: 'GET',
      url: '/api/consumption?from=2026-01-15&to=2026-01-17&granularity=month',
    });
    expect(month.json().points).toHaveLength(1);
    expect(month.json().points[0].key).toBe('2026-01');
  });
});
