import path from 'node:path';

export interface AppConfig {
  /** Port d'écoute HTTP. */
  port: number;
  /** Adresse d'écoute (0.0.0.0 en conteneur). */
  host: string;
  /** Secret servant à dériver la clé de chiffrement des tokens (obligatoire). */
  appSecret: string;
  /** Répertoire de données persistantes (SQLite). */
  dataDir: string;
  /** Répertoire du build de la SPA à servir en production (optionnel). */
  webDistDir: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const appSecret = env['APP_SECRET'];
  if (!appSecret || appSecret.length < 16) {
    throw new Error(
      'APP_SECRET est obligatoire (au moins 16 caractères). ' +
        'Il sert à chiffrer le token Home Assistant et le secret RTE au repos.',
    );
  }
  const port = Number(env['PORT'] ?? 3000);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT invalide : ${env['PORT']}`);
  }
  return {
    port,
    host: env['HOST'] ?? '0.0.0.0',
    appSecret,
    dataDir: path.resolve(env['DATA_DIR'] ?? './data'),
    webDistDir: env['WEB_DIST_DIR'] ? path.resolve(env['WEB_DIST_DIR']) : undefined,
  };
}
