import { addDays, eachDay, type LocalClock, type TempoColor } from '@elec-ha/core';
import type { HaClient } from '../ha/client.js';
import { parseColor } from './csv.js';

/** Élément d'historique HA (format complet ou minimal). */
interface HaHistoryItem {
  s?: string;
  state?: string;
  lu?: number;
  lc?: number;
  last_updated?: string;
  last_changed?: string;
}

function itemTime(it: HaHistoryItem): number | null {
  if (typeof it.lu === 'number') return it.lu * 1000;
  if (typeof it.lc === 'number') return it.lc * 1000;
  const iso = it.last_updated ?? it.last_changed;
  if (iso) {
    const ms = Date.parse(iso);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

/**
 * Lit l'historique du sensor couleur Tempo dans le recorder HA et en déduit la couleur
 * de chaque jour de `[from, to]` : état en vigueur à 12:00 locale (au cœur de la fenêtre
 * 06:00 → 06:00). Les jours antérieurs au premier état enregistré restent inconnus.
 */
export async function fetchTempoFromHaEntity(
  ha: HaClient,
  clock: LocalClock,
  entityId: string,
  from: string,
  to: string,
): Promise<Record<string, TempoColor>> {
  const startMs = clock.localMidnightUtcMs(from);
  const endMs = clock.localMidnightUtcMs(addDays(to, 1));
  const history = await ha.withConnection((conn) =>
    conn.sendMessagePromise<Record<string, HaHistoryItem[]>>({
      type: 'history/history_during_period',
      start_time: new Date(startMs).toISOString(),
      end_time: new Date(endMs).toISOString(),
      entity_ids: [entityId],
      minimal_response: true,
      no_attributes: true,
      significant_changes_only: false,
    }),
  );

  const changes: Array<{ at: number; color: TempoColor }> = [];
  for (const it of history[entityId] ?? []) {
    const at = itemTime(it);
    const color = parseColor(it.s ?? it.state ?? '');
    if (at !== null && color) changes.push({ at, color });
  }
  changes.sort((a, b) => a.at - b.at);

  const out: Record<string, TempoColor> = {};
  for (const date of eachDay(from, to)) {
    const noon = clock.localMidnightUtcMs(date) + 12 * 3_600_000;
    let current: TempoColor | undefined;
    for (const c of changes) {
      if (c.at > noon) break;
      current = c.color;
    }
    if (current) out[date] = current;
  }
  return out;
}
