import { addDays, compareDates, daysInclusive, eachDay, isIsoDate } from './dates.js';
import { createOffpeakResolver } from './offpeak.js';
import { LocalClock } from './time.js';
import {
  TEMPO_COLORS,
  type HourBucket,
  type OffpeakSets,
  type Period,
  type TariffGrid,
  type TariffOption,
  type TempoCalendar,
  type TempoColor,
} from './types.js';

// ---------------------------------------------------------------------------
// Entrées
// ---------------------------------------------------------------------------

export interface SimulationOptions {
  /** Heure locale de bascule de la couleur Tempo (défaut 6 : la couleur s'applique de 06:00 à 06:00). */
  colorSwitchHour?: number;
  /** Fuseau IANA (défaut `Europe/Paris`). */
  zone?: string;
}

export interface SimulationInput {
  period: Period;
  buckets: readonly HourBucket[];
  grid: TariffGrid;
  offpeak: OffpeakSets;
  tempoCalendar: TempoCalendar;
  currentOption: TariffOption;
  options?: SimulationOptions;
}

// ---------------------------------------------------------------------------
// Sorties
// ---------------------------------------------------------------------------

export type WarningCode =
  | 'missing_hours'
  | 'negative_values'
  | 'unknown_tempo_days'
  | 'tempo_partial'
  | 'smoothing_no_reference';

export interface SimulationWarning {
  code: WarningCode;
  message: string;
  days?: string[];
}

export interface Delta {
  /** `coût(option) − coût(optionActuelle)` en €. */
  amount: number;
  /** Écart relatif en % du coût de l'option actuelle. */
  percent: number;
}

export interface OptionCost {
  option: TariffOption;
  /** Total période € TTC = consommation + abonnement au prorata. */
  total: number;
  consumption: number;
  subscription: number;
  /** Consommation totale de la période en kWh (identique pour les trois options). */
  kwh: number;
  /** Prix moyen €/kWh = consommation € ÷ kWh facturés. */
  averagePrice: number;
  /** `null` sur l'option actuelle. */
  deltaVsCurrent: Delta | null;
}

export interface HpHcSplit {
  kwh: number;
  /** Part de la consommation totale (0..1). */
  share: number;
  cost: number;
}

export interface HpHcCost extends OptionCost {
  hp: HpHcSplit;
  hc: HpHcSplit;
}

export interface TempoColorDetail {
  /** Nombre de jours de cette couleur dans la période. */
  days: number;
  hpKwh: number;
  hcKwh: number;
  hpCost: number;
  hcCost: number;
  total: number;
}

export interface TempoCost extends OptionCost {
  /** `true` si des heures ont été exclues faute de couleur connue. */
  partial: boolean;
  excludedKwh: number;
  /** Jours Tempo (dates de début de fenêtre) dont la couleur est inconnue et qui portent de la consommation. */
  excludedDays: string[];
  /** Jours civils de la période sans couleur dans le calendrier. */
  unknownDays: string[];
  byColor: Record<TempoColor, TempoColorDetail>;
}

export interface SimulationResult {
  period: Period & { days: number };
  kwhTotal: number;
  hours: { expected: number; present: number; missing: number };
  /** Jours civils ayant au moins une heure sans donnée. */
  missingDays: string[];
  /** Nombre de créneaux à valeur négative ramenés à 0. */
  negativeHours: number;
  base: OptionCost;
  hphc: HpHcCost;
  tempo: TempoCost;
  /** Option la moins chère (Tempo ignorée si partielle). */
  best: TariffOption;
  warnings: SimulationWarning[];
}

// ---------------------------------------------------------------------------
// Résolution des créneaux (réutilisée par le lissage)
// ---------------------------------------------------------------------------

/** Créneau horaire résolu en heure locale. */
export interface ResolvedHour {
  startUtc: number;
  /** Date civile locale. */
  date: string;
  minuteOfDay: number;
  /** Jour Tempo auquel appartient le créneau (fenêtre 06:00 → 06:00). */
  tempoDay: string;
  /** kWh (≥ 0), ou `null` si la donnée est absente. */
  kwh: number | null;
  /** `true` si la valeur d'origine était négative (remise à zéro de compteur). */
  negative: boolean;
}

export interface ResolvedSeries {
  hours: ResolvedHour[];
  clock: LocalClock;
  colorSwitchHour: number;
}

export function resolveHours(
  buckets: readonly HourBucket[],
  period: Period,
  options: SimulationOptions = {},
): ResolvedSeries {
  const clock = new LocalClock(options.zone ?? undefined);
  const colorSwitchHour = options.colorSwitchHour ?? 6;
  const switchMin = colorSwitchHour * 60;
  const hours: ResolvedHour[] = [];
  for (const b of buckets) {
    const local = clock.toLocal(b.startUtc);
    if (compareDates(local.date, period.from) < 0 || compareDates(local.date, period.to) > 0)
      continue;
    const negative = b.kwh !== null && b.kwh < 0;
    hours.push({
      startUtc: b.startUtc,
      date: local.date,
      minuteOfDay: local.minuteOfDay,
      tempoDay: local.minuteOfDay < switchMin ? addDays(local.date, -1) : local.date,
      kwh: b.kwh === null ? null : negative ? 0 : b.kwh,
      negative,
    });
  }
  hours.sort((a, b) => a.startUtc - b.startUtc);
  return { hours, clock, colorSwitchHour };
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

function assertInput(input: SimulationInput): void {
  const { from, to } = input.period;
  if (!isIsoDate(from) || !isIsoDate(to)) throw new Error(`Période invalide : ${from} → ${to}`);
  if (compareDates(from, to) > 0) throw new Error('La date de début doit précéder la date de fin.');
  const h = input.options?.colorSwitchHour;
  if (h !== undefined && (!Number.isInteger(h) || h < 0 || h > 23)) {
    throw new Error(`Heure de bascule de couleur invalide : ${h}`);
  }
}

function prorataSubscription(yearly: number, days: number): number {
  return (yearly * days) / 365;
}

function delta(cost: number, current: number, isCurrent: boolean): Delta | null {
  if (isCurrent) return null;
  const amount = cost - current;
  return { amount, percent: current === 0 ? 0 : (amount / current) * 100 };
}

export function simulate(input: SimulationInput): SimulationResult {
  assertInput(input);
  const series = resolveHours(input.buckets, input.period, input.options);
  return simulateResolved(input, series);
}

/**
 * Cœur du calcul sur une série déjà résolue. Exposé pour permettre au lissage (lot 6)
 * de substituer des valeurs sans re-résoudre les créneaux.
 */
export function simulateResolved(input: SimulationInput, series: ResolvedSeries): SimulationResult {
  const { grid, tempoCalendar, currentOption } = input;
  const { from, to } = input.period;
  const days = daysInclusive(from, to);
  const periodDays = eachDay(from, to);
  const { clock } = series;

  const hcShareHphc = createOffpeakResolver(input.offpeak.hphc);
  const hcShareTempo = createOffpeakResolver(input.offpeak.tempo);
  const p = grid;

  // Accumulateurs
  let kwhTotal = 0;
  let baseCost = 0;
  let hpKwh = 0;
  let hcKwh = 0;
  let negativeHours = 0;
  let present = 0;
  const presentPerDay = new Map<string, number>();
  const byColor: Record<TempoColor, TempoColorDetail> = {
    blue: { days: 0, hpKwh: 0, hcKwh: 0, hpCost: 0, hcCost: 0, total: 0 },
    white: { days: 0, hpKwh: 0, hcKwh: 0, hpCost: 0, hcCost: 0, total: 0 },
    red: { days: 0, hpKwh: 0, hcKwh: 0, hpCost: 0, hcCost: 0, total: 0 },
  };
  let excludedKwh = 0;
  const excludedDays = new Set<string>();

  for (const h of series.hours) {
    if (h.kwh === null) continue;
    present++;
    presentPerDay.set(h.date, (presentPerDay.get(h.date) ?? 0) + 1);
    if (h.negative) negativeHours++;
    const kwh = h.kwh;
    kwhTotal += kwh;

    // Base
    baseCost += kwh * p.base.prices.kwh;

    // HP/HC
    const hc1 = kwh * hcShareHphc(h.minuteOfDay);
    hcKwh += hc1;
    hpKwh += kwh - hc1;

    // Tempo
    const color = tempoCalendar[h.tempoDay];
    if (color === undefined) {
      excludedKwh += kwh;
      if (kwh > 0) excludedDays.add(h.tempoDay);
      continue;
    }
    const hc2 = kwh * hcShareTempo(h.minuteOfDay);
    const hp2 = kwh - hc2;
    const d = byColor[color];
    d.hpKwh += hp2;
    d.hcKwh += hc2;
  }

  // Coûts HP/HC
  const hpCost = hpKwh * p.hphc.prices.hp;
  const hcCost = hcKwh * p.hphc.prices.hc;

  // Coûts Tempo par couleur + nombre de jours par couleur
  const tp = p.tempo.prices;
  const priceHp: Record<TempoColor, number> = { blue: tp.blueHp, white: tp.whiteHp, red: tp.redHp };
  const priceHc: Record<TempoColor, number> = { blue: tp.blueHc, white: tp.whiteHc, red: tp.redHc };
  let tempoCost = 0;
  for (const c of TEMPO_COLORS) {
    const d = byColor[c];
    d.hpCost = d.hpKwh * priceHp[c];
    d.hcCost = d.hcKwh * priceHc[c];
    d.total = d.hpCost + d.hcCost;
    tempoCost += d.total;
  }
  const unknownDays: string[] = [];
  for (const date of periodDays) {
    const c = tempoCalendar[date];
    if (c === undefined) unknownDays.push(date);
    else byColor[c].days++;
  }

  // Heures manquantes
  let expected = 0;
  const missingDays: string[] = [];
  for (const date of periodDays) {
    const n = clock.hoursInDay(date);
    expected += n;
    if ((presentPerDay.get(date) ?? 0) < n) missingDays.push(date);
  }

  // Assemblage
  const subs = {
    base: prorataSubscription(p.base.subscriptionYearly, days),
    hphc: prorataSubscription(p.hphc.subscriptionYearly, days),
    tempo: prorataSubscription(p.tempo.subscriptionYearly, days),
  };
  const totals = {
    base: baseCost + subs.base,
    hphc: hpCost + hcCost + subs.hphc,
    tempo: tempoCost + subs.tempo,
  };
  const current = totals[currentOption];
  const tempoKwhBilled = kwhTotal - excludedKwh;
  const partial = excludedKwh > 0;

  const base: OptionCost = {
    option: 'base',
    total: totals.base,
    consumption: baseCost,
    subscription: subs.base,
    kwh: kwhTotal,
    averagePrice: kwhTotal > 0 ? baseCost / kwhTotal : 0,
    deltaVsCurrent: delta(totals.base, current, currentOption === 'base'),
  };
  const hphc: HpHcCost = {
    option: 'hphc',
    total: totals.hphc,
    consumption: hpCost + hcCost,
    subscription: subs.hphc,
    kwh: kwhTotal,
    averagePrice: kwhTotal > 0 ? (hpCost + hcCost) / kwhTotal : 0,
    deltaVsCurrent: delta(totals.hphc, current, currentOption === 'hphc'),
    hp: { kwh: hpKwh, share: kwhTotal > 0 ? hpKwh / kwhTotal : 0, cost: hpCost },
    hc: { kwh: hcKwh, share: kwhTotal > 0 ? hcKwh / kwhTotal : 0, cost: hcCost },
  };
  const tempo: TempoCost = {
    option: 'tempo',
    total: totals.tempo,
    consumption: tempoCost,
    subscription: subs.tempo,
    kwh: kwhTotal,
    averagePrice: tempoKwhBilled > 0 ? tempoCost / tempoKwhBilled : 0,
    deltaVsCurrent: delta(totals.tempo, current, currentOption === 'tempo'),
    partial,
    excludedKwh,
    excludedDays: [...excludedDays].sort(),
    unknownDays,
    byColor,
  };

  const candidates: TariffOption[] = partial ? ['base', 'hphc'] : ['base', 'hphc', 'tempo'];
  const best = candidates.reduce((a, b) => (totals[b] < totals[a] ? b : a));

  const warnings: SimulationWarning[] = [];
  const missing = expected - present;
  if (missing > 0) {
    warnings.push({
      code: 'missing_hours',
      message: `${missing} h sans donnée sur la période (${missingDays.length} jour(s) concerné(s)).`,
      days: missingDays,
    });
  }
  if (negativeHours > 0) {
    warnings.push({
      code: 'negative_values',
      message: `${negativeHours} créneau(x) à valeur négative (remise à zéro de compteur) ramené(s) à 0.`,
    });
  }
  if (unknownDays.length > 0) {
    warnings.push({
      code: 'unknown_tempo_days',
      message: `${unknownDays.length} jour(s) sans couleur Tempo connue.`,
      days: unknownDays,
    });
  }
  if (partial) {
    warnings.push({
      code: 'tempo_partial',
      message: `Total Tempo partiel : ${excludedKwh.toFixed(3)} kWh exclus faute de couleur connue.`,
      days: tempo.excludedDays,
    });
  }

  return {
    period: { from, to, days },
    kwhTotal,
    hours: { expected, present, missing },
    missingDays,
    negativeHours,
    base,
    hphc,
    tempo,
    best,
    warnings,
  };
}
