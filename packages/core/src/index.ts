/**
 * @elec-ha/core – moteur de calcul pur.
 *
 * Ce package ne fait aucune I/O : il reçoit une série horaire, une grille tarifaire,
 * des créneaux HC et des couleurs Tempo, et renvoie un résultat de simulation.
 * Il est exécutable indifféremment côté serveur (apps/api) et navigateur (apps/web).
 */

export const CORE_VERSION = '0.0.0';

/** Options du Tarif Bleu simulées. */
export type TariffOption = 'base' | 'hphc' | 'tempo';

export const TARIFF_OPTIONS: readonly TariffOption[] = ['base', 'hphc', 'tempo'];
