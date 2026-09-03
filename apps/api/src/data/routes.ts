import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { SyncEvent } from '@elec-ha/core';
import { ApiError, badRequest, notConfigured } from '../errors.js';
import { HaClient } from '../ha/client.js';
import { PeriodQuerySchema } from '../schemas.js';
import { syncConsumption } from './sync.js';

/**
 * `POST /api/data/sync?from&to` : charge/complète le cache et diffuse la progression en SSE.
 * Les couleurs Tempo sont complétées ici à partir du lot 3.
 */
export const dataRoutes: FastifyPluginAsyncTypebox = async (app) => {
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
      const lastSyncAt = new Date().toISOString();
      app.ctx.settings.setLastSyncAt(lastSyncAt);
      send({ type: 'done', consumption, tempo: { fetched: 0, missing: 0 }, lastSyncAt });
    } catch (err) {
      req.log.error(err);
      const code = err instanceof ApiError ? err.code : 'sync_failed';
      send({ type: 'error', code, message: err instanceof Error ? err.message : String(err) });
    } finally {
      reply.raw.end();
    }
  });
};
