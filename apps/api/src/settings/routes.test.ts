import type { FastifyInstance } from 'fastify';
import { TARIF_BLEU_2026_08 } from '@elec-ha/core';
import { testApp } from '../../test/helpers.js';

describe('/api/settings', () => {
  let app: FastifyInstance;
  beforeEach(async () => {
    app = await testApp();
  });
  afterEach(() => app.close());

  it('renvoie des valeurs par défaut non configurées', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.configured).toBe(false);
    expect(body.grid).toBeNull();
    expect(body.ha).toEqual({ url: null, tokenSet: false, entityIds: [] });
    expect(body.offpeak).toEqual({ hphc: [], tempo: [{ startMin: 1320, endMin: 360 }] });
    expect(body.advanced).toEqual({
      colorSwitchHour: 6,
      smoothingRefDays: 3,
      smoothingSearchWindowDays: 14,
      smoothingProfile: 'median',
    });
    expect(body.tempo.source).toBe('rte');
  });

  it('enregistre la configuration sans jamais renvoyer les secrets', async () => {
    const put = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        ha: {
          url: 'http://homeassistant.local:8123/',
          token: 'TOKEN-XYZ',
          entityIds: ['sensor.linky_hp', 'sensor.linky_hc', 'sensor.linky_hp'],
        },
        grid: TARIF_BLEU_2026_08[6],
        tempo: { rteClientId: 'cid', rteClientSecret: 'RTE-SECRET-XYZ' },
        offpeak: {
          hphc: [{ startMin: 1350, endMin: 390 }],
          tempo: [{ startMin: 1320, endMin: 360 }],
        },
        currentOption: 'hphc',
      },
    });
    expect(put.statusCode).toBe(200);
    const body = put.json();
    expect(body.configured).toBe(true);
    expect(body.ha).toEqual({
      url: 'http://homeassistant.local:8123',
      tokenSet: true,
      entityIds: ['sensor.linky_hp', 'sensor.linky_hc'],
    });
    expect(body.tempo).toEqual({ source: 'rte', rteClientId: 'cid', rteSecretSet: true });
    expect(body.grid.tempo.prices.redHp).toBe(0.7295);
    expect(body.grid.validFrom).toBe('2026-08-01');
    expect(body.currentOption).toBe('hphc');
    expect(JSON.stringify(body)).not.toMatch(/TOKEN-XYZ|RTE-SECRET-XYZ/);

    // Les secrets stockés sont chiffrés et relisibles côté serveur
    const secrets = app.ctx.settings.getSecrets();
    expect(secrets).toEqual({ haToken: 'TOKEN-XYZ', rteClientSecret: 'RTE-SECRET-XYZ' });

    // Mise à jour partielle : le token reste défini
    const put2 = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { subscribedPowerKva: 9 },
    });
    expect(put2.json().ha.tokenSet).toBe(true);
    expect(put2.json().subscribedPowerKva).toBe(9);

    // Token vide = suppression
    const put3 = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { ha: { token: '' } },
    });
    expect(put3.json().ha.tokenSet).toBe(false);
    expect(put3.json().configured).toBe(false);
  });

  it('valide le corps et les créneaux', async () => {
    const bad = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { subscribedPowerKva: 7 },
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().code).toBe('validation');

    const overlap = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: {
        offpeak: {
          hphc: [
            { startMin: 0, endMin: 120 },
            { startMin: 60, endMin: 180 },
          ],
          tempo: [],
        },
      },
    });
    expect(overlap.statusCode).toBe(400);
    expect(overlap.json().error).toMatch(/chevauchent/);

    const url = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      payload: { ha: { url: 'homeassistant' } },
    });
    expect(url.statusCode).toBe(400);
  });
});
