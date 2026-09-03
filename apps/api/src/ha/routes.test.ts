import type { FastifyInstance } from 'fastify';
import { startFakeHa, type FakeHa } from '../../test/fake-ha.js';
import { testApp } from '../../test/helpers.js';

describe('/api/ha/test', () => {
  let app: FastifyInstance;
  let ha: FakeHa;
  beforeEach(async () => {
    app = await testApp();
    ha = await startFakeHa({
      statisticIds: [
        {
          statistic_id: 'sensor.energy',
          name: 'Énergie',
          unit_of_measurement: 'kWh',
          has_sum: true,
          has_mean: false,
          source: 'recorder',
        },
        {
          statistic_id: 'sensor.energy_wh',
          name: null,
          unit_of_measurement: 'Wh',
          has_sum: true,
          has_mean: false,
          source: 'recorder',
        },
        {
          statistic_id: 'sensor.power',
          name: 'Puissance',
          unit_of_measurement: 'W',
          has_sum: false,
          has_mean: true,
          source: 'recorder',
        },
        {
          statistic_id: 'sensor.temp_kwh_mean',
          name: null,
          unit_of_measurement: 'kWh',
          has_sum: false,
          has_mean: true,
          source: 'recorder',
        },
      ],
      states: [
        {
          entity_id: 'sensor.rte_tempo_couleur_actuelle',
          state: 'Bleu',
          attributes: { friendly_name: 'Couleur du jour' },
        },
        { entity_id: 'sensor.other', state: '1', attributes: {} },
      ],
    });
  });
  afterEach(async () => {
    await app.close();
    await ha.close();
  });

  it('teste la connexion avec un URL/token fournis et liste les entités éligibles', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ha/test',
      payload: { url: ha.url, token: ha.token },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ ok: true, version: '2026.8.1', eligibleEntities: 2 });
    expect(body.entities.map((e: { statisticId: string }) => e.statisticId)).toEqual([
      'sensor.energy',
      'sensor.energy_wh',
    ]);
    expect(body.tempoEntities).toEqual([
      { entityId: 'sensor.rte_tempo_couleur_actuelle', name: 'Couleur du jour', state: 'Bleu' },
    ]);
  });

  it('signale un token refusé', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ha/test',
      payload: { url: ha.url, token: 'wrong' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe('ha_unauthorized');
  });

  it('signale un hôte injoignable', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/ha/test',
      payload: { url: 'http://127.0.0.1:1', token: 'x' },
    });
    expect(res.statusCode).toBe(502);
    expect(res.json().code).toBe('ha_unreachable');
  });

  it('utilise les identifiants stockés quand le corps est vide', async () => {
    await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { ha: { url: ha.url, token: ha.token } },
    });
    const res = await app.inject({ method: 'POST', url: '/api/ha/test', payload: {} });
    expect(res.statusCode).toBe(200);
    const entities = await app.inject({ method: 'GET', url: '/api/ha/entities' });
    expect(entities.json().entities).toHaveLength(2);
  });

  it('refuse /api/ha/entities sans configuration', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/ha/entities' });
    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('not_configured');
  });
});
