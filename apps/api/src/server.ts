import { buildApp } from './app.js';
import { loadConfig, type AppConfig } from './config.js';

let config: AppConfig;
try {
  config = loadConfig();
} catch (err) {
  console.error(
    `[elec-ha] Configuration invalide : ${err instanceof Error ? err.message : String(err)}`,
  );
  process.exit(1);
}

const app = await buildApp({ config });

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
