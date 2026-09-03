import { and, gte, inArray, lt, sum } from 'drizzle-orm';
import {
  addDays,
  eachDay,
  type HourBucket,
  type LocalClock,
  type TempoCalendar,
  type TempoColor,
} from '@elec-ha/core';
import type { Db } from '../db/index.js';
import { consumptionHours, tempoDays } from '../db/schema.js';

/**
 * Lecture du cache de consommation sur `[from, to]` (dates locales incluses) : les entités
 * configurées sont additionnées heure par heure. Une heure est présente dès qu'une entité
 * a une valeur.
 */
export function loadBuckets(
  db: Db,
  clock: LocalClock,
  statisticIds: readonly string[],
  from: string,
  to: string,
): HourBucket[] {
  if (statisticIds.length === 0) return [];
  const startMs = clock.localMidnightUtcMs(from);
  const endMs = clock.localMidnightUtcMs(addDays(to, 1));
  return db
    .select({ startUtc: consumptionHours.startUtc, kwh: sum(consumptionHours.kwh).mapWith(Number) })
    .from(consumptionHours)
    .where(
      and(
        inArray(consumptionHours.statisticId, [...statisticIds]),
        gte(consumptionHours.startUtc, startMs),
        lt(consumptionHours.startUtc, endMs),
      ),
    )
    .groupBy(consumptionHours.startUtc)
    .orderBy(consumptionHours.startUtc)
    .all();
}

export function loadTempoCalendar(db: Db, from: string, to: string): TempoCalendar {
  const dates = eachDay(from, to);
  const rows = db
    .select({ date: tempoDays.date, color: tempoDays.color })
    .from(tempoDays)
    .where(inArray(tempoDays.date, dates))
    .all();
  const cal: Record<string, TempoColor> = {};
  for (const r of rows) cal[r.date] = r.color as TempoColor;
  return cal;
}
