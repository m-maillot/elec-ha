import { inArray } from 'drizzle-orm';
import {
  addDays,
  compareDates,
  eachDay,
  type LocalClock,
  type TempoColor,
  type TempoCompletionResult,
  type TempoSource,
} from '@elec-ha/core';
import type { Db } from '../db/index.js';
import { tempoDays } from '../db/schema.js';
import { HaClient } from '../ha/client.js';
import type { SettingsRepository } from '../settings/repository.js';
import { fetchTempoFromHaEntity } from './ha-entity.js';
import { RteTempoClient } from './rte.js';

export interface CompleteTempoParams {
  db: Db;
  clock: LocalClock;
  settings: SettingsRepository;
  from: string;
  to: string;
  today?: string;
  onProgress?: (done: number, total: number, message: string) => void;
  /** Injection pour les tests (URL du faux serveur RTE). */
  rteBaseUrl?: string;
}

/** Dates de `[from, to]` absentes de `tempo_days`. */
export function missingTempoDays(db: Db, from: string, to: string): string[] {
  const dates = eachDay(from, to);
  const known = new Set(
    db
      .select({ date: tempoDays.date })
      .from(tempoDays)
      .where(inArray(tempoDays.date, dates))
      .all()
      .map((r) => r.date),
  );
  return dates.filter((d) => !known.has(d));
}

export function storeTempoDays(
  db: Db,
  colors: Record<string, TempoColor>,
  source: TempoSource,
): number {
  const fetchedAt = new Date().toISOString();
  let stored = 0;
  db.transaction((tx) => {
    for (const [date, color] of Object.entries(colors)) {
      const res = tx
        .insert(tempoDays)
        .values({ date, color, source, fetchedAt })
        .onConflictDoNothing()
        .run();
      stored += res.changes;
    }
  });
  return stored;
}

/** Regroupe des dates triées en plages contiguës. */
function contiguousRanges(dates: readonly string[]): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  for (const d of dates) {
    const last = out.at(-1);
    if (last && addDays(last.to, 1) === d) last.to = d;
    else out.push({ from: d, to: d });
  }
  return out;
}

/**
 * Complète `tempo_days` pour les dates inconnues de `[from − 1, to]` (la veille sert à la
 * fenêtre 06:00 du premier jour) selon la source configurée. Une date connue n'est jamais
 * redemandée. Les dates futures (au-delà de demain) ne sont pas demandées.
 */
export async function completeTempoDays(
  params: CompleteTempoParams,
): Promise<TempoCompletionResult> {
  const { db, clock, settings, onProgress } = params;
  const today = params.today ?? clock.toLocal(Date.now()).date;
  const from = addDays(params.from, -1);
  const to = compareDates(params.to, addDays(today, 1)) > 0 ? addDays(today, 1) : params.to;
  const dto = settings.get();
  const source = dto.tempo.source;

  const missing = compareDates(from, to) <= 0 ? missingTempoDays(db, from, to) : [];
  const done = (fetched: number, error?: string): TempoCompletionResult => {
    const stillMissing = missingTempoDays(db, from, params.to).length;
    const base = { source: source === 'csv' ? null : source, fetched, missing: stillMissing };
    return error ? { ...base, error } : base;
  };
  if (missing.length === 0 || source === 'csv') return done(0);

  const ranges = contiguousRanges(missing);
  let fetched = 0;
  try {
    if (source === 'rte') {
      const secrets = settings.getSecrets();
      if (!dto.tempo.rteClientId || !secrets.rteClientSecret) {
        return done(0, 'Identifiants RTE non configurés.');
      }
      const rte = new RteTempoClient(dto.tempo.rteClientId, secrets.rteClientSecret, {
        clock,
        ...(params.rteBaseUrl ? { baseUrl: params.rteBaseUrl } : {}),
      });
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i]!;
        onProgress?.(i, ranges.length, `Couleurs Tempo RTE du ${r.from} au ${r.to}`);
        fetched += storeTempoDays(db, await rte.fetchCalendar(r.from, r.to), 'rte');
      }
    } else {
      const conn = settings.getHaConnection();
      if (!conn || !dto.ha.tempoEntityId) {
        return done(0, 'Entité couleur Tempo Home Assistant non configurée.');
      }
      const ha = new HaClient(conn.url, conn.token);
      for (let i = 0; i < ranges.length; i++) {
        const r = ranges[i]!;
        onProgress?.(i, ranges.length, `Couleurs Tempo (entité HA) du ${r.from} au ${r.to}`);
        const colors = await fetchTempoFromHaEntity(ha, clock, dto.ha.tempoEntityId, r.from, r.to);
        fetched += storeTempoDays(db, colors, 'ha_entity');
      }
    }
    onProgress?.(ranges.length, ranges.length, 'Couleurs Tempo complétées');
    return done(fetched);
  } catch (err) {
    return done(fetched, err instanceof Error ? err.message : String(err));
  }
}
