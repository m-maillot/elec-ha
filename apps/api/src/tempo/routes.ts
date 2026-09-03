import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { and, gte, lte } from 'drizzle-orm';
import { eachDay, type TempoColor, type TempoDaysResponse } from '@elec-ha/core';
import { tempoDays } from '../db/schema.js';
import { badRequest } from '../errors.js';
import { PeriodQuerySchema, TempoCsvBodySchema } from '../schemas.js';
import { importTempoCsv } from './csv.js';

export const tempoRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get(
    '/api/tempo/days',
    { schema: { querystring: PeriodQuerySchema } },
    (req): TempoDaysResponse => {
      const { from, to } = req.query;
      if (from > to) throw badRequest('La date de début doit précéder la date de fin.');
      const rows = app.ctx.db
        .select()
        .from(tempoDays)
        .where(and(gte(tempoDays.date, from), lte(tempoDays.date, to)))
        .orderBy(tempoDays.date)
        .all();
      const known = new Set(rows.map((r) => r.date));
      return {
        from,
        to,
        days: rows.map((r) => ({ date: r.date, color: r.color as TempoColor, source: r.source })),
        missing: eachDay(from, to).filter((d) => !known.has(d)),
      };
    },
  );

  /** Import CSV `date;couleur` (JSON `{ csv }` ou corps `text/csv`). */
  app.addContentTypeParser(
    ['text/csv', 'text/plain'],
    { parseAs: 'string' },
    (_req, body, done) => {
      done(null, { csv: body });
    },
  );
  app.post('/api/tempo/days', { schema: { body: TempoCsvBodySchema } }, (req) => {
    return importTempoCsv(app.ctx.db, req.body.csv, req.body.overwrite ?? false);
  });
};
