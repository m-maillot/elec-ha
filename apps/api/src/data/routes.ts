import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { SyncEvent } from '@elec-ha/core';
import { ApiError, badRequest, notConfigured } from '../errors.js';
import { HaClient } from '../ha/client.js';
import { PeriodQuerySchema } from '../schemas.js';
import { syncConsumption } from './sync.js';
import { completeTempoDays } from '../tempo/sources.js';

export interface DataRoutesOptions {
  /** URL de base RTE injectable (tests). */
  rteBaseUrl?: string;
}

/**
 * `POST /api/data/sync?from&to` : charge/complète le cache de consommation puis les
 * couleurs Tempo, et diffuse la progression en SSE.
 */
export const dataRoutes: FastifyPluginAsyncTypebox<DataRoutesOptions> = async (app, opts) => {
  app.post('/api/data/sync', { schema: { querystring: PeriodQuerySchema } }, async (req, reply) => {
    const { from, to } = req.query;
    if (from > to) throw badRequest('La date de début doit précéder la date de fin.');
    const conn = app.ctx.settings.getHaConnection();
    if (!conn) throw notConfigured('connexion Home Assistant');
    if (!conn.entityId) throw notConfigured('entité de consommation');

    reply.hijack();
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    const send = (event: SyncEvent) => {
      reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const consumption = await syncConsumption({
        db: app.ctx.db,
        clock: app.ctx.clock,
        ha: new HaClient(conn.url, conn.token),
        statisticId: conn.entityId,
        from,
        to,
        onProgress: (done, total, message) =>
          send({ type: 'progress', step: 'consumption', done, total, message }),
      });
      const tempo = await completeTempoDays({
        db: app.ctx.db,
        clock: app.ctx.clock,
        settings: app.ctx.settings,
        from,
        to,
        ...(opts.rteBaseUrl ? { rteBaseUrl: opts.rteBaseUrl } : {}),
        onProgress: (done, total, message) => send({ type: 'progress', step: 'tempo', done, total, message }),
      });
      const lastSyncAt = new Date().toISOString();
      app.ctx.settings.setLastSyncAt(lastSyncAt);
      send({ type: 'done', consumption, tempo, lastSyncAt });
    } catch (err) {
      req.log.error(err);
      const code = err instanceof ApiError ? err.code : 'sync_failed';
      send({ type: 'error', code, message: err instanceof Error ? err.message : String(err) });
    } finally {
      reply.raw.end();
    }
  });
};
