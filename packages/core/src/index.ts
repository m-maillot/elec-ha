/**
 * @elec-ha/core – moteur de calcul pur.
 *
 * Ce package ne fait aucune I/O : il reçoit une série horaire, une grille tarifaire,
 * des créneaux HC et des couleurs Tempo, et renvoie un résultat de simulation.
 * Il est exécutable indifféremment côté serveur (apps/api) et navigateur (apps/web).
 */

export const CORE_VERSION = '0.1.0';

export * from './types.js';
export * from './dates.js';
export { LocalClock, DEFAULT_ZONE, type LocalInstant } from './time.js';
export * from './offpeak.js';
export * from './tariffs.js';
export * from './simulate.js';
export * from './contracts.js';
