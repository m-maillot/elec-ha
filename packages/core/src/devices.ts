import { createOffpeakResolver } from './offpeak.js';
import { resolveHours, type SimulationOptions } from './simulate.js';
import type {
  HourBucket,
  OffpeakSets,
  Period,
  TariffGrid,
  TempoCalendar,
  TempoColor,
} from './types.js';

/** Consommation horaire d'un appareil individuel (tableau de bord Énergie de HA). */
export interface DeviceSeries {
  statisticId: string;
  name: string;
  buckets: readonly HourBucket[];
  /** Appareil parent (`included_in_stat` de HA) : évite de compter deux fois dans « Non suivi ». */
  includedIn?: string | null;
}

export interface DeviceCostsInput {
  period: Period;
  /** Consommation totale du logement (entités de consommation additionnées). */
  totalBuckets: readonly HourBucket[];
  devices: readonly DeviceSeries[];
  grid: TariffGrid;
  offpeak: OffpeakSets;
  tempoCalendar: TempoCalendar;
  options?: SimulationOptions;
}

/** Consommation et coût (consommation seule, hors abonnement) d'une série dans les trois options. */
export interface SeriesCost {
  kwh: number;
  /** Répartition selon les créneaux HC de l'option HP/HC. */
  hpKwh: number;
  hcKwh: number;
  presentHours: number;
  cost: { base: number; hphc: number; tempo: number };
  /** kWh non valorisés en Tempo faute de couleur connue. */
  tempoExcludedKwh: number;
}

export interface DeviceCostRow extends SeriesCost {
  /** `null` pour la ligne « Non suivi ». */
  statisticId: string | null;
  name: string;
  /** Part de la consommation totale du logement (0..1), `null` si le total est nul. */
  share: number | null;
  includedIn?: string | null;
}

export interface DeviceCostsResult {
  period: Period;
  /** Logement entier. */
  total: SeriesCost;
  /** Appareils triés par consommation décroissante. */
  devices: DeviceCostRow[];
  /** Total − appareils de premier niveau ; `null` sans appareil. Ramené à 0 si négatif. */
  untracked: DeviceCostRow | null;
  /** `true` si la somme des appareils dépasse le total du logement. */
  overcounted: boolean;
}

/** Valorise une série horaire dans les trois options (consommation seule). */
export function priceSeries(
  buckets: readonly HourBucket[],
  input: Pick<DeviceCostsInput, 'period' | 'grid' | 'offpeak' | 'tempoCalendar' | 'options'>,
): SeriesCost {
  const { grid, tempoCalendar } = input;
  const series = resolveHours(buckets, input.period, input.options);
  const hcHphc = createOffpeakResolver(input.offpeak.hphc);
  const hcTempo = createOffpeakResolver(input.offpeak.tempo);
  const tp = grid.tempo.prices;
  const priceHp: Record<TempoColor, number> = { blue: tp.blueHp, white: tp.whiteHp, red: tp.redHp };
  const priceHc: Record<TempoColor, number> = { blue: tp.blueHc, white: tp.whiteHc, red: tp.redHc };

  const out: SeriesCost = {
    kwh: 0,
    hpKwh: 0,
    hcKwh: 0,
    presentHours: 0,
    cost: { base: 0, hphc: 0, tempo: 0 },
    tempoExcludedKwh: 0,
  };
  for (const h of series.hours) {
    if (h.kwh === null) continue;
    const kwh = h.kwh;
    out.presentHours++;
    out.kwh += kwh;
    const hc1 = kwh * hcHphc(h.minuteOfDay);
    out.hcKwh += hc1;
    out.hpKwh += kwh - hc1;
    out.cost.base += kwh * grid.base.prices.kwh;
    out.cost.hphc += (kwh - hc1) * grid.hphc.prices.hp + hc1 * grid.hphc.prices.hc;
    const color = tempoCalendar[h.tempoDay];
    if (color === undefined) {
      out.tempoExcludedKwh += kwh;
    } else {
      const hc2 = kwh * hcTempo(h.minuteOfDay);
      out.cost.tempo += (kwh - hc2) * priceHp[color] + hc2 * priceHc[color];
    }
  }
  return out;
}

const share = (kwh: number, total: number) => (total > 0 ? kwh / total : null);

/**
 * Consommation et coût de chaque appareil, plus une ligne « Non suivi » (logement − appareils).
 * Les coûts étant linéaires en kWh horaires, « Non suivi » est obtenu par différence.
 */
export function computeDeviceCosts(input: DeviceCostsInput): DeviceCostsResult {
  const total = priceSeries(input.totalBuckets, input);
  const ids = new Set(input.devices.map((d) => d.statisticId));
  const rows: DeviceCostRow[] = input.devices.map((d) => {
    const cost = priceSeries(d.buckets, input);
    return {
      statisticId: d.statisticId,
      name: d.name,
      ...cost,
      share: share(cost.kwh, total.kwh),
      ...(d.includedIn ? { includedIn: d.includedIn } : {}),
    };
  });
  rows.sort((a, b) => b.kwh - a.kwh);

  let untracked: DeviceCostRow | null = null;
  let overcounted = false;
  if (rows.length > 0) {
    // Seuls les appareils de premier niveau sont retranchés (les enfants sont déjà dans leur parent).
    const top = rows.filter((r) => !r.includedIn || !ids.has(r.includedIn));
    const sum = (f: (r: SeriesCost) => number) => top.reduce((a, r) => a + f(r), 0);
    const diff = (f: (r: SeriesCost) => number) => f(total) - sum(f);
    const kwh = diff((r) => r.kwh);
    overcounted = kwh < -0.0005;
    const pos = (v: number) => Math.max(0, v);
    untracked = {
      statisticId: null,
      name: '',
      kwh: pos(kwh),
      hpKwh: pos(diff((r) => r.hpKwh)),
      hcKwh: pos(diff((r) => r.hcKwh)),
      presentHours: total.presentHours,
      cost: {
        base: pos(diff((r) => r.cost.base)),
        hphc: pos(diff((r) => r.cost.hphc)),
        tempo: pos(diff((r) => r.cost.tempo)),
      },
      tempoExcludedKwh: pos(diff((r) => r.tempoExcludedKwh)),
      share: share(pos(kwh), total.kwh),
    };
  }

  return { period: input.period, total, devices: rows, untracked, overcounted };
}
