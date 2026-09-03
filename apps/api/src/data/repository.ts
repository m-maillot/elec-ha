import { and, gte, lt, inArray } from 'drizzle-orm';
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

/** Lecture du cache de consommation sur `[from, to]` (dates locales incluses). */
export function loadBuckets(db: Db, clock: LocalClock, from: string, to: string): HourBucket[] {
  const startMs = clock.localMidnightUtcMs(from);
  const endMs = clock.localMidnightUtcMs(addDays(to, 1));
  return db
    .select({ startUtc: consumptionHours.startUtc, kwh: consumptionHours.kwh })
    .from(consumptionHours)
    .where(and(gte(consumptionHours.startUtc, startMs), lt(consumptionHours.startUtc, endMs)))
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
