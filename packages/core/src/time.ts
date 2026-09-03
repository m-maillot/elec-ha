import { IANAZone } from 'luxon';
import { toIsoDate, isoDateToUtcMs } from './dates.js';

export const DEFAULT_ZONE = 'Europe/Paris';

/** Position d'un instant en heure locale. */
export interface LocalInstant {
  /** Date civile locale `YYYY-MM-DD`. */
  date: string;
  /** Minutes écoulées depuis minuit local (0..1439). */
  minuteOfDay: number;
}

/**
 * Horloge locale pour un fuseau IANA. Convertit des instants UTC en (date, minute du jour)
 * et inversement, en gérant les changements d'heure (jours de 23 h ou 25 h).
 *
 * Les décalages sont mis en cache par heure UTC : les transitions DST ont toujours lieu
 * sur une heure ronde UTC, la valeur est donc constante à l'intérieur d'une heure.
 */
export class LocalClock {
  private readonly zone: IANAZone;
  private readonly offsetCache = new Map<number, number>();

  constructor(readonly zoneName: string = DEFAULT_ZONE) {
    this.zone = IANAZone.create(zoneName);
    if (!this.zone.isValid) throw new Error(`Fuseau horaire invalide : ${zoneName}`);
  }

  /**
   * Décalage UTC en minutes à l'instant donné.
   * Cache par jour UTC : si le décalage est identique en début et fin de journée, il est constant
   * sur toute la journée ; sinon (jour de transition DST) on interroge le fuseau directement.
   */
  offsetMinutes(utcMs: number): number {
    const dayKey = Math.floor(utcMs / 86_400_000);
    let entry = this.offsetCache.get(dayKey);
    if (entry === undefined) {
      const dayStart = dayKey * 86_400_000;
      const a = this.zone.offset(dayStart);
      const b = this.zone.offset(dayStart + 86_400_000 - 1);
      entry = a === b ? a : NaN;
      this.offsetCache.set(dayKey, entry);
    }
    return Number.isNaN(entry) ? this.zone.offset(utcMs) : entry;
  }

  toLocal(utcMs: number): LocalInstant {
    const localMs = utcMs + this.offsetMinutes(utcMs) * 60_000;
    const dayMs = ((localMs % 86_400_000) + 86_400_000) % 86_400_000;
    return {
      date: toIsoDate(localMs - dayMs),
      minuteOfDay: Math.floor(dayMs / 60_000),
    };
  }

  /** Instant UTC de minuit local pour une date civile. */
  localMidnightUtcMs(date: string): number {
    // Minuit « naïf » puis correction par le décalage effectif (deux passes pour les transitions).
    const naive = isoDateToUtcMs(date);
    const guess = naive - this.zone.offset(naive) * 60_000;
    return naive - this.zone.offset(guess) * 60_000;
  }

  /** Nombre d'heures du jour civil local (23, 24 ou 25). */
  hoursInDay(date: string): number {
    const start = this.localMidnightUtcMs(date);
    const next = this.localMidnightUtcMs(toIsoDate(isoDateToUtcMs(date) + 86_400_000));
    return Math.round((next - start) / 3_600_000);
  }
}
