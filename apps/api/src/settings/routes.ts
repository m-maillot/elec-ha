import type { FastifyPluginAsyncTypebox } from '@fastify/type-provider-typebox';
import type { SettingsDto } from '@elec-ha/core';
import { SettingsUpdateSchema } from '../schemas.js';

export const settingsRoutes: FastifyPluginAsyncTypebox = async (app) => {
  app.get('/api/settings', (): SettingsDto => app.ctx.settings.get());

  app.put('/api/settings', { schema: { body: SettingsUpdateSchema } }, (req): SettingsDto => {
    return app.ctx.settings.update(req.body);
  });
};
