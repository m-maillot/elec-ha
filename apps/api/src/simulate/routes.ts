import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { addDays, simulate, simulateWithSmoothing, type SimulateResponse } from '@elec-ha/core';
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

    const smoothingEnabled = req.body.smoothing?.enabled ?? false;
    // Avec lissage, les jours de référence peuvent se trouver hors de la période analysée.
    const margin = smoothingEnabled ? params.smoothingSearchWindowDays + 1 : 0;
    const loadFrom = addDays(from, -margin);
    const loadTo = addDays(to, margin);
    const simulationInput = {
      period: { from, to },
      buckets: loadBuckets(db, clock, settings.get().ha.entityIds, loadFrom, loadTo),
      grid: params.grid,
      offpeak: params.offpeak,
      // La veille est nécessaire pour les heures avant la bascule de couleur du premier jour.
      tempoCalendar: loadTempoCalendar(db, addDays(loadFrom, -1), loadTo),
      currentOption: req.body.currentOption ?? params.currentOption,
      options: { colorSwitchHour: params.colorSwitchHour, zone: clock.zoneName },
    };
    const result = smoothingEnabled
      ? simulateWithSmoothing(simulationInput, {
          refDays: params.smoothingRefDays,
          searchWindowDays: params.smoothingSearchWindowDays,
          profile: params.smoothingProfile,
        })
      : simulate(simulationInput);

    return { ...result, smoothingApplied: smoothingEnabled, lastSyncAt: settings.get().lastSyncAt };
  });
};
