import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { addDays, computeDeviceCosts, type DeviceCostsResponse } from '@elec-ha/core';
import { loadBuckets, loadTempoCalendar } from '../data/repository.js';
import { badRequest, notConfigured } from '../errors.js';
import { PeriodQuerySchema } from '../schemas.js';

export const devicesRoutes: FastifyPluginAsyncTypebox = async (app) => {
  /** Consommation et coût (hors abonnement) de chaque appareil dans les trois options. */
  app.get(
    '/api/devices/costs',
    { schema: { querystring: PeriodQuerySchema } },
    (req): DeviceCostsResponse => {
      const { from, to } = req.query;
      if (from > to) throw badRequest('La date de début doit précéder la date de fin.');
      const { db, clock, settings } = app.ctx;
      const params = settings.getSimulationSettings();
      if (!params) throw notConfigured('grille tarifaire');
      const dto = settings.get();

      const result = computeDeviceCosts({
        period: { from, to },
        totalBuckets: loadBuckets(db, clock, dto.ha.entityIds, from, to),
        devices: dto.devices.map((d) => ({
          statisticId: d.statisticId,
          name: d.name,
          buckets: loadBuckets(db, clock, [d.statisticId], from, to),
          ...(d.includedIn ? { includedIn: d.includedIn } : {}),
        })),
        grid: params.grid,
        offpeak: params.offpeak,
        tempoCalendar: loadTempoCalendar(db, addDays(from, -1), to),
        options: { colorSwitchHour: params.colorSwitchHour, zone: clock.zoneName },
      });
      return { ...result, lastSyncAt: dto.lastSyncAt };
    },
  );
};
