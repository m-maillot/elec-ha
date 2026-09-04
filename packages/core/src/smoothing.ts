import { addDays, eachDay } from './dates.js';
import {
  resolveHours,
  simulateResolved,
  type Delta,
  type ResolvedHour,
  type ResolvedSeries,
  type SimulationInput,
  type SimulationResult,
  type SimulationWarning,
} from './simulate.js';
import type { TariffOption, TempoCalendar, TempoColor } from './types.js';

/** Paramètres avancés du lissage (§5.5). */
export interface SmoothingOptions {
  /** Jours de référence non rouges de chaque côté (défaut 3). */
  refDays?: number;
  /** Fenêtre de recherche maximale de chaque côté, en jours (défaut 14). */
  searchWindowDays?: number;
  /** Nombre minimal d'heures présentes pour qu'un jour serve de référence (défaut 20). */
  minHoursForReference?: number;
  /** Consommation minimale (kWh) pour qu'un jour serve de référence (défaut 1). */
  minKwhForReference?: number;
}

/** Période à lisser : jours blancs ou rouges consécutifs. */
export interface SmoothingPeriod {
  /** Jours consécutifs (dates civiles) et leur couleur. */
  days: string[];
  colors: TempoColor[];
  /** Jours de référence retenus avant / après la période. */
  referencesBefore: string[];
  referencesAfter: string[];
  /** `false` si aucune référence n'a été trouvée : la période est laissée telle quelle. */
  smoothed: boolean;
}

export interface SmoothingSummary {
  refDays: number;
  searchWindowDays: number;
  periods: SmoothingPeriod[];
  /** Coût total Tempo (abonnement inclus) sans lissage. */
  costWithoutSmoothing: number;
  /** Σ (E′ − E) sur les heures substituées : énergie ajoutée (ou retirée si négative). */
  redistributedKwh: number;
  /** Heures substituées : début UTC → kWh lissés (pour la superposition graphique). */
  substitutedHours: Array<{ start: number; kwh: number }>;
}

export interface SmoothedSimulationResult extends SimulationResult {
  smoothing: SmoothingSummary;
}

/**
 * Regroupe les jours blancs ou rouges consécutifs de `[from, to]` en périodes à lisser
 * (un bloc blanc + rouge forme une seule période).
 */
export function groupSmoothingPeriods(
  calendar: TempoCalendar,
  from: string,
  to: string,
): Array<{ days: string[]; colors: TempoColor[] }> {
  const periods: Array<{ days: string[]; colors: TempoColor[] }> = [];
  let current: { days: string[]; colors: TempoColor[] } | null = null;
  for (const d of eachDay(from, to)) {
    const color = calendar[d];
    if (color === 'red' || color === 'white') {
      if (current && addDays(current.days[current.days.length - 1]!, 1) === d) {
        current.days.push(d);
        current.colors.push(color);
      } else {
        current = { days: [d], colors: [color] };
        periods.push(current);
      }
    } else {
      current = null;
    }
  }
  return periods;
}

/** Heures d'un jour Tempo, indexées par jour puis par heure locale (0..23). */
type DayHours = Map<string, ResolvedHour[]>;

function indexByTempoDay(hours: readonly ResolvedHour[]): DayHours {
  const map: DayHours = new Map();
  for (const h of hours) {
    if (h.kwh === null) continue;
    let list = map.get(h.tempoDay);
    if (!list) {
      list = [];
      map.set(h.tempoDay, list);
    }
    list.push(h);
  }
  return map;
}

/**
 * Profil horaire de substitution : moyenne heure par heure (heure locale) des jours de
 * référence. Une heure absente d'un jour de référence n'entre pas dans sa moyenne.
 */
export function hourlyProfile(days: DayHours, references: readonly string[]): (number | null)[] {
  const sums = new Array<number>(24).fill(0);
  const counts = new Array<number>(24).fill(0);
  for (const ref of references) {
    for (const h of days.get(ref) ?? []) {
      const hh = Math.floor(h.minuteOfDay / 60);
      sums[hh]! += h.kwh ?? 0;
      counts[hh]! += 1;
    }
  }
  return sums.map((s, i) => (counts[i]! > 0 ? s / counts[i]! : null));
}

function findReferences(
  days: DayHours,
  calendar: TempoCalendar,
  start: string,
  direction: 1 | -1,
  count: number,
  window: number,
  minHours: number,
  minKwh: number,
): string[] {
  const refs: string[] = [];
  for (let i = 1; i <= window && refs.length < count; i++) {
    const d = addDays(start, i * direction);
    // Seuls les jours bleus servent de référence : blancs, rouges et jours sans couleur
    // connue sont sautés, ainsi que les jours incomplets ou à consommation nulle.
    if (calendar[d] !== 'blue') continue;
    const hours = days.get(d) ?? [];
    if (hours.length < minHours) continue;
    // Un jour à consommation (quasi) nulle n'est pas une référence (index non mis à jour, capteur en panne).
    if (hours.reduce((sum, h) => sum + (h.kwh ?? 0), 0) < minKwh) continue;
    refs.push(d);
  }
  return direction === -1 ? refs.reverse() : refs;
}

/**
 * Applique le lissage (§5.5) à une série résolue : pour chaque période blanche/rouge, les heures
 * des jours concernés (fenêtre de couleur) sont remplacées par le profil moyen des jours bleus
 * de référence, uniquement si cela augmente la consommation du jour (jamais vers le bas).
 * Seules les heures présentes sont substituées (les trous restent des trous).
 * `referenceSeries` (défaut : `series`) peut couvrir une période plus large pour trouver des
 * références avant/après la période analysée.
 */
export function applySmoothing(
  series: ResolvedSeries,
  calendar: TempoCalendar,
  from: string,
  to: string,
  options: SmoothingOptions = {},
  referenceSeries: ResolvedSeries = series,
): {
  series: ResolvedSeries;
  periods: SmoothingPeriod[];
  redistributedKwh: number;
  substituted: Map<number, number>;
  /** kWh ajoutés par jour Tempo lissé. */
  addedByDay: Map<string, number>;
} {
  const refDays = options.refDays ?? 3;
  const window = options.searchWindowDays ?? 14;
  const minHours = options.minHoursForReference ?? 20;
  const minKwh = options.minKwhForReference ?? 1;
  const days = indexByTempoDay(referenceSeries.hours);
  const periodDays = referenceSeries === series ? days : indexByTempoDay(series.hours);
  const substituted = new Map<number, number>();
  const periods: SmoothingPeriod[] = [];
  const addedByDay = new Map<string, number>();
  let redistributedKwh = 0;

  for (const { days: redDays, colors } of groupSmoothingPeriods(calendar, from, to)) {
    const first = redDays[0]!;
    const last = redDays[redDays.length - 1]!;
    const before = findReferences(days, calendar, first, -1, refDays, window, minHours, minKwh);
    const after = findReferences(days, calendar, last, 1, refDays, window, minHours, minKwh);
    const refs = [...before, ...after];
    const period: SmoothingPeriod = {
      days: redDays,
      colors,
      referencesBefore: before,
      referencesAfter: after,
      smoothed: refs.length > 0,
    };
    periods.push(period);
    if (!period.smoothed) continue;
    const profile = hourlyProfile(days, refs);
    for (const d of redDays) {
      const dayHours = periodDays.get(d) ?? [];
      // Le lissage ne peut qu'augmenter la consommation : si le jour a déjà consommé au moins
      // autant que le profil des jours bleus (sur ses heures présentes), il est laissé tel quel.
      let actual = 0;
      let expected = 0;
      for (const h of dayHours) {
        const value = profile[Math.floor(h.minuteOfDay / 60)] ?? null;
        if (value === null) continue;
        actual += h.kwh ?? 0;
        expected += value;
      }
      if (expected <= actual) continue;
      for (const h of dayHours) {
        const value = profile[Math.floor(h.minuteOfDay / 60)] ?? null;
        if (value === null) continue;
        substituted.set(h.startUtc, value);
        redistributedKwh += value - (h.kwh ?? 0);
        addedByDay.set(d, (addedByDay.get(d) ?? 0) + value - (h.kwh ?? 0));
      }
    }
  }

  const hours = series.hours.map((h) => {
    const v = substituted.get(h.startUtc);
    return v === undefined ? h : { ...h, kwh: v, negative: false };
  });
  return { series: { ...series, hours }, periods, redistributedKwh, substituted, addedByDay };
}

function delta(cost: number, current: number, isCurrent: boolean): Delta | null {
  if (isCurrent) return null;
  const amount = cost - current;
  return { amount, percent: current === 0 ? 0 : (amount / current) * 100 };
}

/**
 * Simulation avec lissage des jours blancs et rouges : Base et HP/HC sont calculées sur la
 * série observée, Tempo sur la série lissée ; écarts et meilleure option recalculés.
 */
export function simulateWithSmoothing(
  input: SimulationInput,
  options: SmoothingOptions = {},
): SmoothedSimulationResult {
  const { from, to } = input.period;
  const window = options.searchWindowDays ?? 14;
  const series = resolveHours(input.buckets, input.period, input.options);
  const plain = simulateResolved(input, series);
  // Les références peuvent être cherchées au-delà de la période analysée si des données existent.
  const referenceSeries = resolveHours(
    input.buckets,
    { from: addDays(from, -(window + 1)), to: addDays(to, window + 1) },
    input.options,
  );
  const smoothed = applySmoothing(series, input.tempoCalendar, from, to, options, referenceSeries);
  const withSmoothing = simulateResolved(input, smoothed.series);

  const totals: Record<TariffOption, number> = {
    base: plain.base.total,
    hphc: plain.hphc.total,
    tempo: withSmoothing.tempo.total,
  };
  const current = totals[input.currentOption];
  const recalc = <T extends { option: TariffOption; total: number }>(r: T): T => ({
    ...r,
    deltaVsCurrent: delta(r.total, current, r.option === input.currentOption),
  });
  const tempo = recalc(withSmoothing.tempo);
  const candidates: TariffOption[] = tempo.partial ? ['base', 'hphc'] : ['base', 'hphc', 'tempo'];
  const best = candidates.reduce((a, b) => (totals[b] < totals[a] ? b : a));

  const warnings: SimulationWarning[] = [...plain.warnings];
  const unsmoothed = smoothed.periods.filter((p) => !p.smoothed);
  if (unsmoothed.length > 0) {
    warnings.push({
      code: 'smoothing_no_reference',
      message: `${unsmoothed.length} période(s) blanche(s)/rouge(s) non lissée(s) faute de jours bleus de référence.`,
      days: unsmoothed.flatMap((p) => p.days),
    });
  }

  return {
    ...plain,
    base: recalc(plain.base),
    hphc: recalc(plain.hphc),
    tempo,
    best,
    warnings,
    days: plain.days.map((d, i) => ({
      ...d,
      addedKwh: smoothed.addedByDay.get(d.date) ?? 0,
      smoothedHpKwh: withSmoothing.days[i]?.hpKwh ?? d.hpKwh,
      smoothedHcKwh: withSmoothing.days[i]?.hcKwh ?? d.hcKwh,
    })),
    smoothing: {
      refDays: options.refDays ?? 3,
      searchWindowDays: options.searchWindowDays ?? 14,
      periods: smoothed.periods,
      costWithoutSmoothing: plain.tempo.total,
      redistributedKwh: smoothed.redistributedKwh,
      substitutedHours: [...smoothed.substituted.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([start, kwh]) => ({ start, kwh })),
    },
  };
}

export function isSmoothedResult(r: SimulationResult): r is SmoothedSimulationResult {
  return 'smoothing' in r;
}
