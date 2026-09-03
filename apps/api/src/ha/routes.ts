import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { HaEntitiesResponse, HaTestResponse } from '@elec-ha/core';
import { badRequest, notConfigured } from '../errors.js';
import { normalizeUrl } from '../settings/repository.js';
import { HaClient, isEligibleEnergyStatistic } from './client.js';
import { HaTestSchema } from '../schemas.js';

async function collectEntities(ha: HaClient): Promise<HaEntitiesResponse> {
  return ha.withConnection(async (conn) => {
    const [stats, states] = await Promise.all([ha.listStatisticIds(conn), ha.getStates(conn)]);
    const entities = stats
      .filter(isEligibleEnergyStatistic)
      .map((s) => ({
        statisticId: s.statistic_id,
        name: s.name,
        unit: s.unit_of_measurement ?? '',
        source: s.source,
      }))
      .sort((a, b) => a.statisticId.localeCompare(b.statisticId));
    const tempoEntities = states
      .filter((s) => s.entity_id.startsWith('sensor.') && /tempo/i.test(s.entity_id))
      .map((s) => ({
        entityId: s.entity_id,
        name:
          typeof s.attributes['friendly_name'] === 'string' ? s.attributes['friendly_name'] : null,
        state: s.state,
      }))
      .sort((a, b) => a.entityId.localeCompare(b.entityId));
    return { entities, tempoEntities };
  });
}

export const haRoutes: FastifyPluginAsyncTypebox = async (app) => {
  /** Test de connexion : URL/token du corps, ou ceux déjà stockés. */
  app.post(
    '/api/ha/test',
    { schema: { body: HaTestSchema } },
    async (req): Promise<HaTestResponse> => {
      const stored = app.ctx.settings.getHaConnection();
      const url = req.body.url !== undefined ? normalizeUrl(req.body.url) : stored?.url;
      const token = req.body.token || stored?.token;
      if (!url) throw badRequest('URL Home Assistant manquante.');
      if (!token) throw badRequest('Token Home Assistant manquant.');
      const ha = new HaClient(url, token);
      const { version } = await ha.testRest();
      const lists = await collectEntities(ha);
      return { ok: true, version, eligibleEntities: lists.entities.length, ...lists };
    },
  );

  app.get('/api/ha/entities', async (): Promise<HaEntitiesResponse> => {
    const stored = app.ctx.settings.getHaConnection();
    if (!stored) throw notConfigured('connexion Home Assistant');
    return collectEntities(new HaClient(stored.url, stored.token));
  });
};
