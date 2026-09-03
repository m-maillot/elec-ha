import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import {
  addDays,
  createOffpeakResolver,
  resolveHours,
  type ConsumptionPoint,
  type ConsumptionResponse,
  type Granularity,
} from '@elec-ha/core';
import { badRequest } from '../errors.js';
import { loadBuckets, loadTempoCalendar } from '../data/repository.js';
import { ConsumptionQuerySchema } from '../schemas.js';

export const consumptionRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get(
    '/api/consumption',
    { schema: { querystring: ConsumptionQuerySchema } },
    (req): ConsumptionResponse => {
      const { from, to } = req.query;
      const granularity: Granularity = req.query.granularity ?? 'hour';
      if (from > to) throw badRequest('La date de début doit précéder la date de fin.');
      const { db, clock, settings } = app.ctx;
      const dto = settings.get();
      const buckets = loadBuckets(db, clock, settings.get().ha.entityIds, from, to);
      const calendar = loadTempoCalendar(db, addDays(from, -1), to);
      const series = resolveHours(
        buckets,
        { from, to },
        {
          colorSwitchHour: dto.advanced.colorSwitchHour,
          zone: clock.zoneName,
        },
      );
      const hcHphc = createOffpeakResolver(dto.offpeak.hphc);
      const hcTempo = createOffpeakResolver(dto.offpeak.tempo);

      // Indexe les heures présentes par début UTC, puis parcourt toutes les heures attendues
      // pour matérialiser les trous (kwh: null).
      const present = new Map(series.hours.map((h) => [h.startUtc, h]));
      const points: ConsumptionPoint[] = [];
      const startMs = clock.localMidnightUtcMs(from);
      const endMs = clock.localMidnightUtcMs(addDays(to, 1));
      for (let t = startMs; t < endMs; t += 3_600_000) {
        const h = present.get(t);
        const local = clock.toLocal(t);
        const hh = String(Math.floor(local.minuteOfDay / 60)).padStart(2, '0');
        const tempoDay =
          local.minuteOfDay < dto.advanced.colorSwitchHour * 60
            ? addDays(local.date, -1)
            : local.date;
        points.push({
          start: t,
          key: `${local.date}T${hh}:00`,
          kwh: h?.kwh ?? null,
          missingHours: h?.kwh === null || h === undefined ? 1 : 0,
          hcShareHphc: hcHphc(local.minuteOfDay),
          hcShareTempo: hcTempo(local.minuteOfDay),
          tempoColor: calendar[tempoDay] ?? null,
        });
      }

      return {
        from,
        to,
        granularity,
        points: granularity === 'hour' ? points : aggregate(points, granularity, calendar),
        lastSyncAt: dto.lastSyncAt,
      };
    },
  );
};

function aggregate(
  hours: ConsumptionPoint[],
  granularity: 'day' | 'month',
  calendar: Readonly<Record<string, ConsumptionPoint['tempoColor']>>,
): ConsumptionPoint[] {
  const out = new Map<string, ConsumptionPoint>();
  for (const h of hours) {
    const date = h.key.slice(0, 10);
    const key = granularity === 'day' ? date : date.slice(0, 7);
    let p = out.get(key);
    if (!p) {
      p = {
        start: h.start,
        key,
        kwh: null,
        missingHours: 0,
        hcShareHphc: 0,
        hcShareTempo: 0,
        tempoColor: granularity === 'day' ? (calendar[date] ?? null) : null,
      };
      out.set(key, p);
    }
    if (h.kwh === null) p.missingHours++;
    else p.kwh = (p.kwh ?? 0) + h.kwh;
  }
  return [...out.values()];
}
