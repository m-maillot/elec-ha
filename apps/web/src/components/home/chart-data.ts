import type { ConsumptionPoint, Granularity, TariffGrid, TempoColor } from '@elec-ha/core';

export type ColorKey = TempoColor | 'unknown';
export const COLOR_KEYS: readonly ColorKey[] = ['blue', 'white', 'red', 'unknown'];

export interface ChartBucket {
  key: string;
  start: number;
  end: number;
  kwh: number | null;
  missingHours: number;
  /** Répartition selon le jeu HP/HC. */
  hp: number;
  hc: number;
  /** Répartition selon le jeu Tempo, par couleur. */
  tempo: Record<ColorKey, { hp: number; hc: number }>;
  /** Couleur unique du point (heure / jour), `null` si mixte ou inconnue. */
  tempoColor: TempoColor | null;
  /** Coûts consommation (sans abonnement) ; `tempo` `null` si une heure n'a pas de couleur. */
  cost: { base: number; hphc: number; tempo: number | null } | null;
}

const DAY_MS = 86_400_000;

/** Maille d'affichage selon la largeur visible : mois → jour → heure. */
export function chooseGranularity(spanMs: number): Granularity {
  const days = spanMs / DAY_MS;
  if (days > 120) return 'month';
  if (days > 7) return 'day';
  return 'hour';
}

export function bucketKey(point: ConsumptionPoint, granularity: Granularity): string {
  switch (granularity) {
    case 'hour':
      return point.key;
    case 'day':
      return point.key.slice(0, 10);
    case 'month':
      return point.key.slice(0, 7);
  }
}

function emptyTempo(): ChartBucket['tempo'] {
  return {
    blue: { hp: 0, hc: 0 },
    white: { hp: 0, hc: 0 },
    red: { hp: 0, hc: 0 },
    unknown: { hp: 0, hc: 0 },
  };
}

/** Agrège des points horaires (triés) à la maille demandée, avec coûts par option. */
export function aggregate(
  points: readonly ConsumptionPoint[],
  granularity: Granularity,
  grid: TariffGrid | null,
): ChartBucket[] {
  type Acc = ChartBucket & { colors: Set<ColorKey> };
  const out: Acc[] = [];
  let current: Acc | null = null;

  for (const p of points) {
    const key = bucketKey(p, granularity);
    if (!current || current.key !== key) {
      current = {
        key,
        start: p.start,
        end: p.start + 3_600_000,
        kwh: null,
        missingHours: 0,
        hp: 0,
        hc: 0,
        tempo: emptyTempo(),
        tempoColor: null,
        cost: grid ? { base: 0, hphc: 0, tempo: 0 } : null,
        colors: new Set(),
      };
      out.push(current);
    }
    current.end = p.start + 3_600_000;
    if (p.kwh === null) {
      current.missingHours++;
      continue;
    }
    const kwh = Math.max(0, p.kwh);
    current.kwh = (current.kwh ?? 0) + kwh;
    const hc1 = kwh * p.hcShareHphc;
    current.hp += kwh - hc1;
    current.hc += hc1;
    const hc2 = kwh * p.hcShareTempo;
    const hp2 = kwh - hc2;
    const colorKey: ColorKey = p.tempoColor ?? 'unknown';
    current.tempo[colorKey].hp += hp2;
    current.tempo[colorKey].hc += hc2;
    current.colors.add(colorKey);

    if (grid && current.cost) {
      current.cost.base += kwh * grid.base.prices.kwh;
      current.cost.hphc += (kwh - hc1) * grid.hphc.prices.hp + hc1 * grid.hphc.prices.hc;
      if (p.tempoColor && current.cost.tempo !== null) {
        const tp = grid.tempo.prices;
        const priceHp = { blue: tp.blueHp, white: tp.whiteHp, red: tp.redHp }[p.tempoColor];
        const priceHc = { blue: tp.blueHc, white: tp.whiteHc, red: tp.redHc }[p.tempoColor];
        current.cost.tempo += hp2 * priceHp + hc2 * priceHc;
      } else if (kwh > 0) {
        current.cost.tempo = null;
      }
    }
  }

  return out.map(({ colors, ...b }) => {
    const only = colors.size === 1 ? [...colors][0] : undefined;
    return { ...b, tempoColor: only && only !== 'unknown' ? only : null };
  });
}

/** Libellé lisible d'une clé de point. */
export function formatBucketLabel(key: string, granularity: Granularity): string {
  if (granularity === 'hour') {
    const [date, hour] = key.split('T');
    return `${formatDate(date!)} ${hour}`;
  }
  if (granularity === 'day') return formatDate(key);
  const [y, m] = key.split('-');
  return `${MONTHS[Number(m) - 1]} ${y}`;
}

const MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}
