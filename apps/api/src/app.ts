import fs from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import { CORE_VERSION } from '@elec-ha/core';
import type { AppConfig } from './config.js';

export interface BuildAppOptions {
  config: Pick<AppConfig, 'webDistDir'>;
  logger?: boolean;
}

export async function buildApp({
  config,
  logger = true,
}: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger });

  app.get('/api/health', () => ({
    status: 'ok',
    core: CORE_VERSION,
    time: new Date().toISOString(),
  }));

  // En production, l'API sert aussi la SPA (image Docker unique).
  if (config.webDistDir && fs.existsSync(config.webDistDir)) {
    await app.register(fastifyStatic, { root: config.webDistDir, wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}
