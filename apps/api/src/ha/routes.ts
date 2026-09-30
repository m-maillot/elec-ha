import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { HaEnergyDevicesResponse, HaEntitiesResponse, HaTestResponse } from '@elec-ha/core';
import { badRequest, notConfigured } from '../errors.js';
import { normalizeUrl } from '../settings/repository.js';
import { HaClient, isEligibleEnergyStatistic, statisticUnit } from './client.js';
import { HaTestSchema } from '../schemas.js';

async function collectEntities(ha: HaClient): Promise<HaEntitiesResponse> {
  return ha.withConnection(async (conn) => {
    const stats = await ha.listStatisticIds(conn);
    const entities = stats
      .filter(isEligibleEnergyStatistic)
      .map((s) => ({
        statisticId: s.statistic_id,
        name: s.name,
        unit: statisticUnit(s),
        source: s.source,
      }))
      .sort((a, b) => a.statisticId.localeCompare(b.statisticId));
    return { entities, totalStatistics: stats.length };
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

  /** Appareils individuels du tableau de bord Énergie (`energy/get_prefs`). */
  app.get('/api/ha/energy-devices', async (): Promise<HaEnergyDevicesResponse> => {
    const stored = app.ctx.settings.getHaConnection();
    if (!stored) throw notConfigured('connexion Home Assistant');
    const ha = new HaClient(stored.url, stored.token);
    return ha.withConnection(async (conn) => {
      const [prefs, states] = await Promise.all([ha.getEnergyPrefs(conn), ha.getStates(conn)]);
      const friendly = new Map(
        states.map((s) => [s.entity_id, s.attributes['friendly_name']] as const),
      );
      const devices = (prefs.device_consumption ?? []).map((d) => {
        const fallback = friendly.get(d.stat_consumption);
        const name =
          d.name?.trim() ||
          (typeof fallback === 'string' ? fallback.replace(/\s+energy$/i, '') : '') ||
          d.stat_consumption;
        return {
          statisticId: d.stat_consumption,
          name,
          ...(d.included_in_stat ? { includedIn: d.included_in_stat } : {}),
        };
      });
      return { devices };
    });
  });

  app.get('/api/ha/entities', async (): Promise<HaEntitiesResponse> => {
    const stored = app.ctx.settings.getHaConnection();
    if (!stored) throw notConfigured('connexion Home Assistant');
    return collectEntities(new HaClient(stored.url, stored.token));
  });
};
