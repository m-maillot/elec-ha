import type { OffpeakRange } from './types.js';

export const MINUTES_PER_DAY = 1440;
export const OFFPEAK_STEP_MIN = 30;
/** Durée totale conseillée d'heures creuses par jour (8 h). */
export const RECOMMENDED_OFFPEAK_MINUTES = 8 * 60;

export interface OffpeakValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  /** Durée totale HC par jour en minutes. */
  totalMinutes: number;
}

/** Segment `[start, end[` ne chevauchant pas minuit, 0 ≤ start < end ≤ 1440. */
interface Segment {
  start: number;
  end: number;
}

/** Développe les plages en segments ne chevauchant pas minuit. */
export function expandSegments(ranges: readonly OffpeakRange[]): Segment[] {
  const segs: Segment[] = [];
  for (const r of ranges) {
    const end = r.endMin === 0 ? MINUTES_PER_DAY : r.endMin;
    if (end > r.startMin) {
      segs.push({ start: r.startMin, end });
    } else {
      segs.push({ start: r.startMin, end: MINUTES_PER_DAY });
      if (end > 0) segs.push({ start: 0, end });
    }
  }
  return segs.sort((a, b) => a.start - b.start);
}

function fmt(min: number): string {
  const m = min % MINUTES_PER_DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Valide un jeu de plages HC (§4.1.4) : pas de 30 min, bornes valides, `fin ≠ début`,
 * pas de chevauchement. Avertissement non bloquant si le total ≠ 8 h.
 */
export function validateOffpeakRanges(ranges: readonly OffpeakRange[]): OffpeakValidation {
  const errors: string[] = [];
  const warnings: string[] = [];

  ranges.forEach((r, i) => {
    const label = `Plage ${i + 1} (${fmt(r.startMin)}–${fmt(r.endMin)})`;
    if (!Number.isInteger(r.startMin) || !Number.isInteger(r.endMin)) {
      errors.push(`${label} : bornes non entières.`);
      return;
    }
    if (
      r.startMin < 0 ||
      r.startMin >= MINUTES_PER_DAY ||
      r.endMin < 0 ||
      r.endMin > MINUTES_PER_DAY
    ) {
      errors.push(`${label} : bornes hors de 00:00–24:00.`);
      return;
    }
    if (r.startMin % OFFPEAK_STEP_MIN !== 0 || r.endMin % OFFPEAK_STEP_MIN !== 0) {
      errors.push(`${label} : les bornes doivent être au pas de 30 minutes.`);
    }
    if (r.startMin === r.endMin % MINUTES_PER_DAY) {
      errors.push(`${label} : la fin doit être différente du début.`);
    }
  });

  let totalMinutes = 0;
  if (errors.length === 0) {
    const segs = expandSegments(ranges);
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i]!;
      totalMinutes += s.end - s.start;
      const next = segs[i + 1];
      if (next && next.start < s.end) {
        errors.push(`Les plages se chevauchent autour de ${fmt(next.start)}.`);
      }
    }
    if (ranges.length === 0) {
      warnings.push('Aucune plage heures creuses : toute la consommation sera en heures pleines.');
    } else if (totalMinutes !== RECOMMENDED_OFFPEAK_MINUTES) {
      warnings.push(
        `Total heures creuses de ${fmt(totalMinutes)} par jour (8 h attendues habituellement).`,
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings, totalMinutes };
}

/**
 * Part d'un créneau horaire `[minuteOfDay, minuteOfDay + durationMin[` couverte par les plages HC.
 * Retourne un ratio dans [0, 1] (∈ {0, 0.5, 1} pour des plages au pas de 30 min et des créneaux d'une heure).
 */
export function offpeakShare(
  segments: readonly Segment[],
  minuteOfDay: number,
  durationMin = 60,
): number {
  const start = minuteOfDay;
  const end = minuteOfDay + durationMin;
  let covered = 0;
  for (const s of segments) {
    // Le créneau peut dépasser 1440 (23:30–00:30) : on teste aussi la copie décalée du segment.
    for (const shift of [0, MINUTES_PER_DAY]) {
      const a = Math.max(start, s.start + shift);
      const b = Math.min(end, s.end + shift);
      if (b > a) covered += b - a;
    }
  }
  return covered / durationMin;
}

/**
 * Résolveur mémoïsé : minute du jour (début de créneau) → part HC, pour des créneaux d'une heure.
 */
export function createOffpeakResolver(
  ranges: readonly OffpeakRange[],
): (minuteOfDay: number) => number {
  const segments = expandSegments(ranges);
  const cache = new Float64Array(MINUTES_PER_DAY).fill(-1);
  return (minuteOfDay: number) => {
    const m = ((minuteOfDay % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    let v = cache[m]!;
    if (v < 0) {
      v = offpeakShare(segments, m);
      cache[m] = v;
    }
    return v;
  };
}

/** Créneau national Tempo : 22:00–06:00. */
export const DEFAULT_TEMPO_OFFPEAK: OffpeakRange[] = [{ startMin: 22 * 60, endMin: 6 * 60 }];
