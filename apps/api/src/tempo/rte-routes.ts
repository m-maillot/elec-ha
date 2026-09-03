import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import { Type } from '@sinclair/typebox';
import type { RteTestResponse } from '@elec-ha/core';
import { badRequest } from '../errors.js';
import { RteTempoClient } from './rte.js';

export interface RteRoutesOptions {
  /** URL de base injectable (tests). */
  baseUrl?: string;
}

export const rteRoutes: FastifyPluginAsyncTypebox<RteRoutesOptions> = async (app, opts) => {
  /** Vérifie l'obtention d'un jeton OAuth2 et récupère la couleur du jour. */
  app.post(
    '/api/tempo/rte/test',
    {
      schema: {
        body: Type.Object({
          clientId: Type.Optional(Type.String()),
          clientSecret: Type.Optional(Type.String()),
        }),
      },
    },
    async (req): Promise<RteTestResponse> => {
      const dto = app.ctx.settings.get();
      const clientId = req.body.clientId || dto.tempo.rteClientId;
      const clientSecret = req.body.clientSecret || app.ctx.settings.getSecrets().rteClientSecret;
      if (!clientId) throw badRequest('client_id RTE manquant.');
      if (!clientSecret) throw badRequest('client_secret RTE manquant.');
      const rte = new RteTempoClient(clientId, clientSecret, {
        clock: app.ctx.clock,
        ...(opts.baseUrl ? { baseUrl: opts.baseUrl } : {}),
      });
      const date = app.ctx.clock.toLocal(Date.now()).date;
      return { ok: true, date, color: await rte.colorOf(date) };
    },
  );
};
