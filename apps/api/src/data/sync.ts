import { and, gte, lt } from 'drizzle-orm';
import { addDays, eachDay, compareDates, LocalClock } from '@elec-ha/core';
import type { Db } from '../db/index.js';
import { consumptionHours } from '../db/schema.js';
import type { HaClient } from '../ha/client.js';

/** Taille maximale d'une tranche demandée à HA (jours). Réf. spec §6.2. */
export const CHUNK_DAYS = 31;
/** Les N derniers jours sont toujours ré-interrogés (HA peut recalculer les stats récentes). §6.5 */
export const REFRESH_LAST_DAYS = 7;

export interface SyncConsumptionParams {
  db: Db;
  clock: LocalClock;
  ha: HaClient;
  statisticId: string;
  from: string;
  to: string;
  /** Date du jour (locale), injectable pour les tests. */
  today?: string;
  onProgress?: (done: number, total: number, message: string) => void;
}

export interface SyncConsumptionResult {
  chunks: number;
  hoursStored: number;
  daysRequested: number;
}

interface DayRange {
  from: string;
  to: string;
}

/** Regroupe des dates triées en plages contiguës puis les découpe en tranches ≤ `maxDays`. */
export function planChunks(days: readonly string[], maxDays = CHUNK_DAYS): DayRange[] {
  const ranges: DayRange[] = [];
  let current: DayRange | null = null;
  for (const d of days) {
    if (current && addDays(current.to, 1) === d) {
      current.to = d;
    } else {
      current = { from: d, to: d };
      ranges.push(current);
    }
  }
  const chunks: DayRange[] = [];
  for (const r of ranges) {
    let start = r.from;
    while (compareDates(start, r.to) <= 0) {
      const end = addDays(start, maxDays - 1);
      chunks.push({ from: start, to: compareDates(end, r.to) > 0 ? r.to : end });
      start = addDays(end, 1);
    }
  }
  return chunks;
}

/** Jours de `[from, to]` à (re)charger : incomplets dans le cache ou parmi les 7 derniers jours. */
export function selectDaysToFetch(
  db: Db,
  clock: LocalClock,
  from: string,
  to: string,
  today: string,
): string[] {
  const startMs = clock.localMidnightUtcMs(from);
  const endMs = clock.localMidnightUtcMs(addDays(to, 1));
  const rows = db
    .select({ startUtc: consumptionHours.startUtc })
    .from(consumptionHours)
    .where(and(gte(consumptionHours.startUtc, startMs), lt(consumptionHours.startUtc, endMs)))
    .all();
  const perDay = new Map<string, number>();
  for (const r of rows) {
    const d = clock.toLocal(r.startUtc).date;
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const refreshFrom = addDays(today, -(REFRESH_LAST_DAYS - 1));
  return eachDay(from, to).filter(
    (d) => compareDates(d, refreshFrom) >= 0 || (perDay.get(d) ?? 0) < clock.hoursInDay(d),
  );
}

export async function syncConsumption(params: SyncConsumptionParams): Promise<SyncConsumptionResult> {
  const { db, clock, ha, statisticId, from, to, onProgress } = params;
  const today = params.today ?? clock.toLocal(Date.now()).date;
  const days = selectDaysToFetch(db, clock, from, to, today);
  const chunks = planChunks(days);
  let hoursStored = 0;

  if (chunks.length > 0) {
    await ha.withConnection(async (conn) => {
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i]!;
        onProgress?.(i, chunks.length, `Chargement du ${chunk.from} au ${chunk.to}`);
        const startMs = clock.localMidnightUtcMs(chunk.from);
        const endMs = clock.localMidnightUtcMs(addDays(chunk.to, 1));
        const buckets = await ha.statisticsDuringPeriod(conn, statisticId, startMs, endMs);
        hoursStored += storeBuckets(db, buckets, startMs, endMs);
        onProgress?.(i + 1, chunks.length, `Tranche ${i + 1}/${chunks.length} chargée`);
      }
    });
  }

  return { chunks: chunks.length, hoursStored, daysRequested: days.length };
}

/**
 * Calcule `kwh` par bucket (`change` si présent, sinon différence de `sum` avec le bucket
 * précédent, issu de la réponse ou du cache) et insère/remplace dans le cache.
 * Les valeurs négatives sont conservées telles quelles : le moteur les ramène à 0 et les signale.
 */
export function storeBuckets(
  db: Db,
  buckets: readonly { start: number; sum: number | null; change: number | null }[],
  startMs: number,
  endMs: number,
): number {
  const fetchedAt = new Date().toISOString();
  const sorted = [...buckets].sort((a, b) => a.start - b.start);
  let prevSum: number | null = null;
  const first = sorted[0];
  if (first && first.change === null) {
    const prev = db
      .select({ sum: consumptionHours.sourceSum })
      .from(consumptionHours)
      .where(and(gte(consumptionHours.startUtc, first.start - 3_600_000), lt(consumptionHours.startUtc, first.start)))
      .get();
    prevSum = prev?.sum ?? null;
  }

  const rows: (typeof consumptionHours.$inferInsert)[] = [];
  for (const b of sorted) {
    if (b.start < startMs || b.start >= endMs) continue;
    let kwh: number | null = b.change;
    if (kwh === null && b.sum !== null && prevSum !== null) kwh = b.sum - prevSum;
    if (b.sum !== null) prevSum = b.sum;
    if (kwh === null) continue;
    rows.push({ startUtc: b.start, kwh, sourceSum: b.sum, fetchedAt });
  }

  if (rows.length > 0) {
    db.transaction((tx) => {
      for (const row of rows) {
        tx.insert(consumptionHours)
          .values(row)
          .onConflictDoUpdate({
            target: consumptionHours.startUtc,
            set: { kwh: row.kwh, sourceSum: row.sourceSum, fetchedAt },
          })
          .run();
      }
    });
  }
  return rows.length;
}
