import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { addDays, simulate, type SimulateResponse } from '@elec-ha/core';
import { loadBuckets, loadTempoCalendar } from '../data/repository.js';
import { badRequest, notConfigured } from '../errors.js';
import { SimulateBodySchema } from '../schemas.js';

export const simulateRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.post('/api/simulate', { schema: { body: SimulateBodySchema } }, (req): SimulateResponse => {
    const { from, to } = req.body;
    if (from > to) throw badRequest('La date de début doit précéder la date de fin.');
    const { db, clock, settings } = app.ctx;
    const params = settings.getSimulationSettings();
    if (!params) throw notConfigured('grille tarifaire');

    const result = simulate({
      period: { from, to },
      buckets: loadBuckets(db, clock, settings.get().ha.entityIds, from, to),
      grid: params.grid,
      offpeak: params.offpeak,
      // La veille est nécessaire pour les heures avant la bascule de couleur du premier jour.
      tempoCalendar: loadTempoCalendar(db, addDays(from, -1), to),
      currentOption: req.body.currentOption ?? params.currentOption,
      options: { colorSwitchHour: params.colorSwitchHour, zone: clock.zoneName },
    });

    // Le lissage (lot 6) n'est pas encore branché : accepté mais ignoré.
    return { ...result, smoothingApplied: false, lastSyncAt: settings.get().lastSyncAt };
  });
};
