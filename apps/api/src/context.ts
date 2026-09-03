import { LocalClock } from '@elec-ha/core';
import type { Db } from './db/index.js';
import type { SettingsRepository } from './settings/repository.js';

/** Dépendances partagées par les routes. */
export interface AppContext {
  db: Db;
  clock: LocalClock;
  settings: SettingsRepository;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}
