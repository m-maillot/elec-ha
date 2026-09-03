/**
 * Types du domaine – partagés entre le moteur (core), l'API et le front.
 * Toutes les dates « civiles » sont des chaînes `YYYY-MM-DD` en heure locale (Europe/Paris).
 * Tous les instants sont des timestamps epoch en millisecondes (UTC).
 */

/** Options du Tarif Bleu simulées. */
export type TariffOption = 'base' | 'hphc' | 'tempo';
export const TARIFF_OPTIONS: readonly TariffOption[] = ['base', 'hphc', 'tempo'];

/** Couleurs Tempo. */
export type TempoColor = 'blue' | 'white' | 'red';
export const TEMPO_COLORS: readonly TempoColor[] = ['blue', 'white', 'red'];

/** Jeu de créneaux heures creuses : l'option HP/HC et l'option Tempo ont chacune le leur. */
export type OffpeakSetKey = 'hphc' | 'tempo';

/** Puissances souscrites acceptées (kVA). Simple clé de saisie. */
export type SubscribedPower = 3 | 6 | 9 | 12 | 15 | 18;
export const SUBSCRIBED_POWERS: readonly SubscribedPower[] = [3, 6, 9, 12, 15, 18];

/**
 * Plage heures creuses `[startMin, endMin[` en minutes depuis 00:00 heure locale.
 * Pas de 30 minutes. `endMin < startMin` signifie que la plage chevauche minuit.
 * `endMin` peut valoir 1440 (= 24:00).
 */
export interface OffpeakRange {
  startMin: number;
  endMin: number;
}

export interface OffpeakSets {
  hphc: OffpeakRange[];
  tempo: OffpeakRange[];
}

/** Prix en € TTC par kWh. */
export interface BasePrices {
  kwh: number;
}
export interface HpHcPrices {
  hp: number;
  hc: number;
}
export interface TempoPrices {
  blueHp: number;
  blueHc: number;
  whiteHp: number;
  whiteHc: number;
  redHp: number;
  redHc: number;
}

export interface OptionTariff<P> {
  /** Abonnement annuel en € TTC. */
  subscriptionYearly: number;
  prices: P;
}

/** Grille tarifaire complète (une seule grille appliquée à toute la période en V1). */
export interface TariffGrid {
  /** Date d'entrée en vigueur, informative uniquement (`YYYY-MM-DD`). */
  validFrom?: string;
  base: OptionTariff<BasePrices>;
  hphc: OptionTariff<HpHcPrices>;
  tempo: OptionTariff<TempoPrices>;
}

/**
 * Créneau horaire de consommation.
 * `startUtc` : début du créneau (epoch ms), le créneau dure une heure.
 * `kwh` : énergie consommée, `null` si la donnée est absente (trou, jamais zéro).
 */
export interface HourBucket {
  startUtc: number;
  kwh: number | null;
}

/** Couleur Tempo par date civile (`YYYY-MM-DD` → couleur). */
export type TempoCalendar = Readonly<Record<string, TempoColor>>;

/** Période d'analyse, bornes incluses, dates civiles locales. */
export interface Period {
  from: string;
  to: string;
}
