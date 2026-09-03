import type { ConsumptionPoint } from '@elec-ha/core';
import { TARIF_BLEU_2026_08 } from '@elec-ha/core';
import { aggregate, chooseGranularity, formatBucketLabel } from './chart-data.js';

const grid = TARIF_BLEU_2026_08[6]!;

function hour(
  key: string,
  kwh: number | null,
  extra: Partial<ConsumptionPoint> = {},
): ConsumptionPoint {
  const [date, hh] = key.split('T');
  const start = Date.parse(`${date}T${hh}:00Z`);
  const h = Number(hh!.slice(0, 2));
  const hc = h < 6 || h >= 22 ? 1 : 0;
  return {
    start,
    key,
    kwh,
    missingHours: kwh === null ? 1 : 0,
    hcShareHphc: hc,
    hcShareTempo: hc,
    tempoColor: 'blue',
    ...extra,
  };
}

describe('chooseGranularity', () => {
  it('choisit mois → jour → heure selon la largeur', () => {
    expect(chooseGranularity(365 * 86_400_000)).toBe('month');
    expect(chooseGranularity(30 * 86_400_000)).toBe('day');
    expect(chooseGranularity(3 * 86_400_000)).toBe('hour');
  });
});

describe('aggregate', () => {
  const points = [
    hour('2026-01-15T05:00', 2), // HC bleu
    hour('2026-01-15T12:00', 1), // HP bleu
    hour('2026-01-15T23:00', null),
    hour('2026-01-16T10:00', 4, { tempoColor: 'red' }),
    hour('2026-01-16T11:00', 1, { tempoColor: null }),
  ];

  it('agrège par jour avec répartition HP/HC, couleurs et heures manquantes', () => {
    const days = aggregate(points, 'day', grid);
    expect(days.map((b) => b.key)).toEqual(['2026-01-15', '2026-01-16']);
    const d1 = days[0]!;
    expect(d1.kwh).toBe(3);
    expect(d1.missingHours).toBe(1);
    expect(d1).toMatchObject({ hp: 1, hc: 2, tempoColor: 'blue' });
    expect(d1.tempo.blue).toEqual({ hp: 1, hc: 2 });
    expect(d1.cost).toEqual({
      base: 3 * 0.2001,
      hphc: 1 * 0.2142 + 2 * 0.1589,
      tempo: 1 * 0.1654 + 2 * 0.1356,
    });
    const d2 = days[1]!;
    expect(d2.tempoColor).toBeNull(); // rouge + inconnue
    expect(d2.tempo.red).toEqual({ hp: 4, hc: 0 });
    expect(d2.tempo.unknown).toEqual({ hp: 1, hc: 0 });
    expect(d2.cost?.tempo).toBeNull();
    expect(d2.cost?.base).toBeCloseTo(5 * 0.2001, 9);
  });

  it('agrège par mois et conserve les bornes', () => {
    const months = aggregate(points, 'month', grid);
    expect(months).toHaveLength(1);
    expect(months[0]!.key).toBe('2026-01');
    expect(months[0]!.start).toBe(points[0]!.start);
    expect(months[0]!.end).toBe(points[4]!.start + 3_600_000);
    expect(months[0]!.kwh).toBe(8);
  });

  it('maille heure : un point par heure, kwh null conservé', () => {
    const hours = aggregate(points, 'hour', null);
    expect(hours).toHaveLength(5);
    expect(hours[2]!.kwh).toBeNull();
    expect(hours[2]!.cost).toBeNull();
  });
});

describe('formatBucketLabel', () => {
  it('formate selon la maille', () => {
    expect(formatBucketLabel('2026-01-15T05:00', 'hour')).toBe('15/01/2026 05:00');
    expect(formatBucketLabel('2026-01-15', 'day')).toBe('15/01/2026');
    expect(formatBucketLabel('2026-01', 'month')).toBe('janv. 2026');
  });
});
