import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { CORE_VERSION, LocalClock } from '@elec-ha/core';
import type { AppConfig } from './config.js';
import { createSecretCipher } from './crypto.js';
import { openDatabase, type Db } from './db/index.js';
import { ApiError } from './errors.js';
import { SettingsRepository } from './settings/repository.js';
import { settingsRoutes } from './settings/routes.js';
import { haRoutes } from './ha/routes.js';
import { dataRoutes } from './data/routes.js';
import { consumptionRoutes } from './consumption/routes.js';
import { tempoRoutes } from './tempo/routes.js';
import { rteRoutes } from './tempo/rte-routes.js';
import { simulateRoutes } from './simulate/routes.js';

export interface BuildAppOptions {
  config: Pick<AppConfig, 'appSecret' | 'webDistDir'> & { dataDir?: string };
  /** Base déjà ouverte (tests) ; sinon `<dataDir>/elec-ha.sqlite`. */
  db?: Db;
  logger?: boolean;
  /** URL de base de l'API RTE (tests). */
  rteBaseUrl?: string;
}

export async function buildApp({
  config,
  db,
  logger = true,
  rteBaseUrl,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger }).withTypeProvider<TypeBoxTypeProvider>();

  const database = db ?? openDatabase(path.join(config.dataDir ?? './data', 'elec-ha.sqlite'));
  const cipher = createSecretCipher(config.appSecret);
  app.decorate('ctx', {
    db: database,
    clock: new LocalClock(),
    settings: new SettingsRepository(database, cipher),
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof ApiError) {
      return reply.code(err.statusCode).send({ code: err.code, error: err.message });
    }
    const fastifyErr = err as { validation?: unknown; message?: string };
    if (fastifyErr.validation) {
      return reply
        .code(400)
        .send({ code: 'validation', error: fastifyErr.message ?? 'Corps invalide.' });
    }
    req.log.error(err);
    return reply.code(500).send({ code: 'internal', error: 'Erreur interne.' });
  });

  app.get('/api/health', () => ({
    status: 'ok',
    core: CORE_VERSION,
    time: new Date().toISOString(),
  }));

  await app.register(settingsRoutes);
  await app.register(haRoutes);
  await app.register(dataRoutes, rteBaseUrl ? { rteBaseUrl } : {});
  await app.register(consumptionRoutes);
  await app.register(tempoRoutes);
  await app.register(rteRoutes, rteBaseUrl ? { baseUrl: rteBaseUrl } : {});
  await app.register(simulateRoutes);

  // En production, l'API sert aussi la SPA (image Docker unique).
  if (config.webDistDir && fs.existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ code: 'not_found', error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
