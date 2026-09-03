import { addDays, eachDay } from '../dates.js';
import { LocalClock } from '../time.js';
import type { HourBucket, OffpeakSets, TariffGrid, TempoCalendar } from '../types.js';
import { TARIF_BLEU_2026_08 } from '../tariffs.js';

export const clock = new LocalClock('Europe/Paris');

/** Grille 6 kVA au 01/08/2026 (valeurs de la spec §4.1.3, utilisées dans l'exemple §5.6). */
export const grid6: TariffGrid = structuredClone(TARIF_BLEU_2026_08[6]!);

/** Créneaux 22:00–06:00 pour les deux jeux. */
export const offpeak22_6: OffpeakSets = {
  hphc: [{ startMin: 22 * 60, endMin: 6 * 60 }],
  tempo: [{ startMin: 22 * 60, endMin: 6 * 60 }],
};

/**
 * Génère un créneau par heure locale de `from` 00:00 à `to` 24:00 (DST géré),
 * la valeur étant fournie par `kwhAt(date, hour)` où `hour` est l'heure locale du créneau.
 */
export function hourlySeries(
  from: string,
  to: string,
  kwhAt: (date: string, hour: number) => number | null,
): HourBucket[] {
  const start = clock.localMidnightUtcMs(from);
  const end = clock.localMidnightUtcMs(addDays(to, 1));
  const out: HourBucket[] = [];
  for (let t = start; t < end; t += 3_600_000) {
    const local = clock.toLocal(t);
    out.push({ startUtc: t, kwh: kwhAt(local.date, Math.floor(local.minuteOfDay / 60)) });
  }
  return out;
}

/** Profil « jour Tempo » : `hp` kWh répartis sur 06:00–22:00 et `hc` kWh sur 22:00–06:00 (J+1). */
export interface DayProfile {
  hp: number;
  hc: number;
}

/**
 * Série où chaque *jour Tempo* (06:00 → 06:00 J+1) reçoit le profil indiqué (uniforme par plage).
 * Les heures d'un jour Tempo absent de `profiles` valent 0.
 */
export function tempoDaySeries(
  from: string,
  to: string,
  profiles: Record<string, DayProfile>,
): HourBucket[] {
  return hourlySeries(from, to, (date, hour) => {
    const tempoDay = hour < 6 ? addDays(date, -1) : date;
    const p = profiles[tempoDay];
    if (!p) return 0;
    return hour >= 6 && hour < 22 ? p.hp / 16 : p.hc / 8;
  });
}

/** Calendrier bleu sur `[from, to]` avec des exceptions. */
export function calendar(from: string, to: string, overrides: TempoCalendar = {}): TempoCalendar {
  const cal: Record<string, 'blue' | 'white' | 'red'> = {};
  for (const d of eachDay(from, to)) cal[d] = 'blue';
  return { ...cal, ...overrides };
}
