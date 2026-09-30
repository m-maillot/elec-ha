import type { FastifyInstance } from 'fastify';
import { LocalClock } from '@elec-ha/core';
import { startFakeHa, type FakeHa } from '../../test/fake-ha.js';
import { configure, fakeStatistics, testApp } from '../../test/helpers.js';
import { selectDeviceDaysToFetch } from '../data/sync.js';

const clock = new LocalClock();
const hourOf = (t: number) => clock.toLocal(t).minuteOfDay / 60;

/** Logement 1,5 kWh/h (4 la nuit de 23 h à 3 h) ; voiture 3 kWh/h la nuit ; NAS 0,05 kWh/h. */
const statistics = (id: string, startMs: number, endMs: number) =>
  fakeStatistics((t) => {
    const night = hourOf(t) >= 23 || hourOf(t) < 3;
    if (id === 'sensor.voiture_energy') return night ? 3 : 0;
    if (id === 'sensor.nas_energy') return 0.05;
    return night ? 4 : 1.5;
  })(id, startMs, endMs);

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

describe('appareils individuels', () => {
  let app: FastifyInstance;
  let ha: FakeHa;
  beforeEach(async () => {
    app = await testApp();
    ha = await startFakeHa({
      statistics,
      energyPrefs: {
        energy_sources: [],
        device_consumption: [
          { stat_consumption: 'sensor.voiture_energy', name: 'Voiture' },
          { stat_consumption: 'sensor.nas_energy' },
          { stat_consumption: 'sensor.inconnu_energy', included_in_stat: 'sensor.voiture_energy' },
        ],
      },
      states: [
        {
          entity_id: 'sensor.nas_energy',
          state: '12',
          attributes: { friendly_name: 'Livebox NAS Energy' },
        },
      ],
    });
    await configure(app, ha);
    await app.inject({
      method: 'POST',
      url: '/api/tempo/days',
      payload: { csv: '2026-01-14;bleu\n2026-01-15;rouge\n2026-01-16;bleu' },
    });
  });
  afterEach(async () => {
    await app.close();
    await ha.close();
  });

  it('GET /api/ha/energy-devices lit le tableau de bord Énergie', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ha/energy-devices' });
    expect(res.statusCode).toBe(200);
    expect(res.json().devices).toEqual([
      { statisticId: 'sensor.voiture_energy', name: 'Voiture' },
      { statisticId: 'sensor.nas_energy', name: 'Livebox NAS' },
      {
        statisticId: 'sensor.inconnu_energy',
        name: 'sensor.inconnu_energy',
        includedIn: 'sensor.voiture_energy',
      },
    ]);
  });

  it('enregistre les appareils (dédoublonnés, nom par défaut)', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        devices: [
          { statisticId: 'sensor.voiture_energy', name: ' Voiture ' },
          { statisticId: 'sensor.voiture_energy', name: 'Doublon' },
          { statisticId: 'sensor.nas_energy', name: '' },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().devices).toEqual([
      { statisticId: 'sensor.voiture_energy', name: 'Voiture' },
      { statisticId: 'sensor.nas_energy', name: 'sensor.nas_energy' },
    ]);
  });

  it('synchronise les appareils une seule fois par jour et calcule leur coût', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        devices: [
          { statisticId: 'sensor.voiture_energy', name: 'Voiture' },
          { statisticId: 'sensor.nas_energy', name: 'NAS' },
        ],
      },
    });
    const sync = await app.inject({
      method: 'POST',
      url: '/api/data/sync?from=2026-01-15&to=2026-01-16',
    });
    const events = parseSse(sync.body);
    expect(events.some((e) => e.type === 'progress' && e.step === 'devices')).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      consumption: { hoursStored: 48 },
      devices: { chunks: 1, hoursStored: 96, daysRequested: 2 },
    });
    // Les jours couverts ne sont plus redemandés (hors 7 derniers jours)
    const ids = ['sensor.voiture_energy', 'sensor.nas_energy'];
    expect(
      selectDeviceDaysToFetch(app.ctx.db, ids, '2026-01-15', '2026-01-16', '2026-03-01'),
    ).toEqual([]);
    // Un nouvel appareil fait redemander la période ; les jours futurs sont exclus
    expect(
      selectDeviceDaysToFetch(
        app.ctx.db,
        [...ids, 'sensor.new'],
        '2026-01-15',
        '2026-01-16',
        '2026-03-01',
      ),
    ).toEqual(['2026-01-15', '2026-01-16']);
    expect(
      selectDeviceDaysToFetch(app.ctx.db, ids, '2026-01-15', '2026-01-20', '2026-01-16'),
    ).toEqual(['2026-01-15', '2026-01-16']);

    const res = await app.inject({
      method: 'GET',
      url: '/api/devices/costs?from=2026-01-15&to=2026-01-16',
    });
    expect(res.statusCode).toBe(200);
    const r = res.json();
    expect(r.total.kwh).toBeCloseTo(92, 6);
    expect(r.devices.map((d: { name: string }) => d.name)).toEqual(['Voiture', 'NAS']);
    const car = r.devices[0];
    expect(car.kwh).toBeCloseTo(24, 6);
    expect(car.hcKwh).toBeCloseTo(24, 6);
    expect(car.share).toBeCloseTo(24 / 92, 6);
    expect(car.cost.base).toBeCloseTo(24 * 0.2001, 6);
    expect(car.cost.hphc).toBeCloseTo(24 * 0.1589, 6);
    expect(car.cost.tempo).toBeCloseTo(12 * 0.1356 + 12 * 0.1615, 6);
    expect(r.devices[1].kwh).toBeCloseTo(2.4, 6);
    expect(r.untracked.kwh).toBeCloseTo(92 - 24 - 2.4, 6);
    expect(r.overcounted).toBe(false);
  });

  it('sans appareil configuré, renvoie seulement le total', async () => {
    await app.inject({ method: 'POST', url: '/api/data/sync?from=2026-01-15&to=2026-01-16' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/devices/costs?from=2026-01-15&to=2026-01-16',
    });
    expect(res.json()).toMatchObject({ devices: [], untracked: null });
    expect(
      ha.received.filter((m) => m['type'] === 'recorder/statistics_during_period'),
    ).toHaveLength(1);
  });
});
