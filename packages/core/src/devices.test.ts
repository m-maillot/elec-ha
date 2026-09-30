import { computeDeviceCosts, priceSeries } from './devices.js';
import { calendar, grid6, hourlySeries, offpeak22_6 } from './__fixtures__/series.js';

const period = { from: '2026-01-15', to: '2026-01-16' };
const common = {
  period,
  grid: grid6,
  offpeak: offpeak22_6,
  tempoCalendar: calendar('2026-01-14', '2026-01-16', { '2026-01-15': 'red' }),
};
const series = (f: (date: string, hour: number) => number | null) =>
  hourlySeries(period.from, period.to, f);

// Logement : 1 kWh/h. Voiture : 3 kWh/h de 23 h à 3 h (HC). Chauffage : 0,5 kWh/h de 8 h à 20 h (HP).
const house = series((_d, h) => (h >= 23 || h < 3 ? 4 : 1.5));
const car = series((_d, h) => (h >= 23 || h < 3 ? 3 : 0));
const heating = series((_d, h) => (h >= 8 && h < 20 ? 0.5 : 0));

describe('priceSeries', () => {
  it('valorise une série dans les trois options, heure par heure', () => {
    const r = priceSeries(car, common);
    expect(r.kwh).toBe(24); // 4 h × 3 kWh × 2 nuits
    expect(r).toMatchObject({ hpKwh: 0, hcKwh: 24, presentHours: 48, tempoExcludedKwh: 0 });
    expect(r.cost.base).toBeCloseTo(24 * 0.2001, 9);
    expect(r.cost.hphc).toBeCloseTo(24 * 0.1589, 9);
    // 15/01 00–03 h : jour Tempo 14 (bleu) ; 15/01 23 h → 16/01 03 h : jour 15 (rouge) ; 16/01 23 h : bleu
    expect(r.cost.tempo).toBeCloseTo(9 * 0.1356 + 12 * 0.1615 + 3 * 0.1356, 9);
  });

  it('exclut du coût Tempo les heures sans couleur connue', () => {
    const r = priceSeries(heating, { ...common, tempoCalendar: { '2026-01-15': 'red' } });
    expect(r.kwh).toBe(12);
    expect(r.tempoExcludedKwh).toBe(6); // le 16/01
    expect(r.cost.tempo).toBeCloseTo(6 * 0.7295, 9);
  });
});

describe('computeDeviceCosts', () => {
  const r = computeDeviceCosts({
    ...common,
    totalBuckets: house,
    devices: [
      { statisticId: 'sensor.chauffage', name: 'Chauffage', buckets: heating },
      { statisticId: 'sensor.voiture', name: 'Voiture', buckets: car },
    ],
  });

  it('trie par consommation et calcule la part du total', () => {
    expect(r.total.kwh).toBe(8 * 4 + 40 * 1.5); // 92
    expect(r.devices.map((d) => d.name)).toEqual(['Voiture', 'Chauffage']);
    expect(r.devices[0]!.share).toBeCloseTo(24 / 92, 9);
    expect(r.devices[1]).toMatchObject({ kwh: 12, hpKwh: 12, hcKwh: 0 });
    expect(r.devices[1]!.cost.hphc).toBeCloseTo(12 * 0.2142, 9);
    // Chauffage : 6 kWh HP rouge le 15/01, 6 kWh HP bleu le 16/01
    expect(r.devices[1]!.cost.tempo).toBeCloseTo(6 * 0.7295 + 6 * 0.1654, 9);
  });

  it('ajoute une ligne « Non suivi » par différence', () => {
    expect(r.overcounted).toBe(false);
    expect(r.untracked!.kwh).toBeCloseTo(92 - 36, 9);
    expect(r.untracked!.cost.base).toBeCloseTo(56 * 0.2001, 9);
    const sumTempo = r.devices.reduce((a, d) => a + d.cost.tempo, 0) + r.untracked!.cost.tempo;
    expect(sumTempo).toBeCloseTo(r.total.cost.tempo, 9);
    expect(r.untracked!.share).toBeCloseTo(56 / 92, 9);
  });

  it('ne retranche pas deux fois un appareil inclus dans un autre', () => {
    const nested = computeDeviceCosts({
      ...common,
      totalBuckets: house,
      devices: [
        { statisticId: 'sensor.tableau', name: 'Tableau', buckets: house },
        {
          statisticId: 'sensor.voiture',
          name: 'Voiture',
          buckets: car,
          includedIn: 'sensor.tableau',
        },
      ],
    });
    expect(nested.untracked!.kwh).toBeCloseTo(0, 9);
    expect(nested.overcounted).toBe(false);
  });

  it('signale des appareils dépassant le total et ramène « Non suivi » à 0', () => {
    const over = computeDeviceCosts({
      ...common,
      totalBuckets: car,
      devices: [{ statisticId: 'sensor.tableau', name: 'Tableau', buckets: house }],
    });
    expect(over.overcounted).toBe(true);
    expect(over.untracked).toMatchObject({ kwh: 0, cost: { base: 0, hphc: 0, tempo: 0 } });
  });

  it('sans appareil, pas de ligne « Non suivi »', () => {
    const none = computeDeviceCosts({ ...common, totalBuckets: house, devices: [] });
    expect(none.devices).toEqual([]);
    expect(none.untracked).toBeNull();
  });
});
