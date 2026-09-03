import { simulate, type SimulationInput } from './simulate.js';
import {
  calendar,
  grid6,
  hourlySeries,
  offpeak22_6,
  tempoDaySeries,
} from './__fixtures__/series.js';

/** Journée rouge du 15/01 (§5.6) : 10 kWh dont 6 en HC et 4 en HP, tout le reste à 0. */
function spec56Input(overrides: Partial<SimulationInput> = {}): SimulationInput {
  return {
    period: { from: '2026-01-15', to: '2026-01-16' },
    buckets: tempoDaySeries('2026-01-15', '2026-01-16', { '2026-01-15': { hp: 4, hc: 6 } }),
    grid: grid6,
    offpeak: offpeak22_6,
    tempoCalendar: calendar('2026-01-14', '2026-01-16', { '2026-01-15': 'red' }),
    currentOption: 'base',
    ...overrides,
  };
}

describe('simulate – exemple de contrôle §5.6', () => {
  const r = simulate(spec56Input());

  it('calcule la consommation des trois options', () => {
    expect(r.kwhTotal).toBeCloseTo(10, 9);
    expect(r.base.consumption).toBeCloseTo(2.001, 6);
    expect(r.hphc.consumption).toBeCloseTo(1.8102, 6);
    expect(r.tempo.consumption).toBeCloseTo(3.887, 6);
  });

  it('détaille HP/HC et le tableau croisé Tempo', () => {
    expect(r.hphc.hp).toMatchObject({ kwh: 4, share: 0.4 });
    expect(r.hphc.hc.kwh).toBeCloseTo(6, 9);
    expect(r.hphc.hp.cost).toBeCloseTo(0.8568, 6);
    expect(r.hphc.hc.cost).toBeCloseTo(0.9534, 6);

    expect(r.tempo.byColor.red).toMatchObject({ days: 1 });
    expect(r.tempo.byColor.red.hpKwh).toBeCloseTo(4, 9);
    expect(r.tempo.byColor.red.hcKwh).toBeCloseTo(6, 9);
    expect(r.tempo.byColor.red.hpCost).toBeCloseTo(2.918, 6);
    expect(r.tempo.byColor.red.hcCost).toBeCloseTo(0.969, 6);
    expect(r.tempo.byColor.blue.days).toBe(1); // le 16/01
    expect(r.tempo.byColor.blue.total).toBe(0);
    expect(r.tempo.byColor.white.days).toBe(0);
    expect(r.tempo.partial).toBe(false);
  });

  it('applique l’abonnement au prorata (2 jours)', () => {
    expect(r.period.days).toBe(2);
    expect(r.base.subscription).toBeCloseTo((190.32 * 2) / 365, 9);
    expect(r.tempo.subscription).toBeCloseTo((189.6 * 2) / 365, 9);
    expect(r.base.total).toBeCloseTo(2.001 + (190.32 * 2) / 365, 9);
  });

  it('calcule les écarts par rapport à l’option actuelle', () => {
    expect(r.base.deltaVsCurrent).toBeNull();
    expect(r.hphc.deltaVsCurrent!.amount).toBeCloseTo(r.hphc.total - r.base.total, 9);
    expect(r.tempo.deltaVsCurrent!.percent).toBeCloseTo(
      ((r.tempo.total - r.base.total) / r.base.total) * 100,
      9,
    );
    expect(r.best).toBe('hphc');
    expect(r.warnings).toEqual([]);
    expect(r.hours).toEqual({ expected: 48, present: 48, missing: 0 });
  });

  it('prix moyen = consommation ÷ kWh', () => {
    expect(r.base.averagePrice).toBeCloseTo(0.2001, 9);
    expect(r.tempo.averagePrice).toBeCloseTo(0.3887, 9);
  });
});

describe('simulate – fenêtre de couleur 06:00 → 06:00', () => {
  it('facture les HC de 22 h à 6 h du lendemain au tarif du jour rouge', () => {
    // Consommation uniquement le 16/01 entre 00:00 et 06:00 (6 kWh) : jour Tempo = 15/01 (rouge)
    const input = spec56Input({
      buckets: hourlySeries('2026-01-15', '2026-01-16', (d, h) =>
        d === '2026-01-16' && h < 6 ? 1 : 0,
      ),
    });
    const r = simulate(input);
    expect(r.tempo.byColor.red.hcKwh).toBeCloseTo(6, 9);
    expect(r.tempo.consumption).toBeCloseTo(6 * 0.1615, 9);
  });

  it('respecte une heure de bascule personnalisée', () => {
    const input = spec56Input({
      buckets: hourlySeries('2026-01-15', '2026-01-16', (d, h) =>
        d === '2026-01-16' && h < 6 ? 1 : 0,
      ),
      options: { colorSwitchHour: 0 },
    });
    const r = simulate(input);
    expect(r.tempo.byColor.red.hcKwh).toBe(0);
    expect(r.tempo.byColor.blue.hcKwh).toBeCloseTo(6, 9);
  });
});

describe('simulate – données partielles', () => {
  it('compte les heures manquantes comme des trous, pas des zéros', () => {
    const input = spec56Input({
      buckets: hourlySeries('2026-01-15', '2026-01-16', (d, h) =>
        d === '2026-01-16' && h >= 20 ? null : 1,
      ),
    });
    const r = simulate(input);
    expect(r.hours).toEqual({ expected: 48, present: 44, missing: 4 });
    expect(r.missingDays).toEqual(['2026-01-16']);
    expect(r.kwhTotal).toBe(44);
    expect(r.warnings.map((w) => w.code)).toEqual(['missing_hours']);
  });

  it('ramène les valeurs négatives à 0 et le signale', () => {
    const input = spec56Input({
      buckets: hourlySeries('2026-01-15', '2026-01-16', (_d, h) => (h === 3 ? -5 : 1)),
    });
    const r = simulate(input);
    expect(r.kwhTotal).toBe(46);
    expect(r.negativeHours).toBe(2);
    expect(r.warnings.map((w) => w.code)).toEqual(['negative_values']);
  });

  it('exclut du calcul Tempo les jours sans couleur et marque le total partiel', () => {
    const input = spec56Input({
      buckets: hourlySeries('2026-01-15', '2026-01-16', () => 1),
      tempoCalendar: { '2026-01-14': 'blue', '2026-01-15': 'red' }, // 16/01 inconnu
    });
    const r = simulate(input);
    expect(r.tempo.partial).toBe(true);
    expect(r.tempo.unknownDays).toEqual(['2026-01-16']);
    expect(r.tempo.excludedDays).toEqual(['2026-01-16']);
    expect(r.tempo.excludedKwh).toBe(18); // 16/01 de 06:00 à 24:00
    expect(r.tempo.kwh).toBe(48);
    expect(r.tempo.averagePrice).toBeCloseTo(r.tempo.consumption / 30, 9);
    expect(['base', 'hphc']).toContain(r.best);
    expect(r.warnings.map((w) => w.code)).toEqual(['unknown_tempo_days', 'tempo_partial']);
  });

  it('les heures de 00:00 à 06:00 du premier jour dépendent de la veille', () => {
    const input = spec56Input({
      buckets: hourlySeries('2026-01-15', '2026-01-16', () => 1),
      tempoCalendar: { '2026-01-15': 'red', '2026-01-16': 'blue' }, // 14/01 inconnu
    });
    const r = simulate(input);
    expect(r.tempo.excludedDays).toEqual(['2026-01-14']);
    expect(r.tempo.excludedKwh).toBe(6);
    expect(r.tempo.unknownDays).toEqual([]);
  });
});

describe('simulate – changement d’heure', () => {
  it('attend 23 h le 29/03 et 25 h le 25/10, sans cas particulier', () => {
    const r = simulate(
      spec56Input({
        period: { from: '2026-03-29', to: '2026-03-29' },
        buckets: hourlySeries('2026-03-29', '2026-03-29', () => 1),
        tempoCalendar: calendar('2026-03-28', '2026-03-29'),
      }),
    );
    expect(r.hours).toEqual({ expected: 23, present: 23, missing: 0 });
    expect(r.kwhTotal).toBe(23);
    // HC 22:00–06:00 : 00:00–06:00 sans l'heure 02:00 (5 h) + 22:00–24:00 (2 h) = 7 h
    expect(r.hphc.hc.kwh).toBe(7);

    const r2 = simulate(
      spec56Input({
        period: { from: '2026-10-25', to: '2026-10-25' },
        buckets: hourlySeries('2026-10-25', '2026-10-25', () => 1),
        tempoCalendar: calendar('2026-10-24', '2026-10-25'),
      }),
    );
    expect(r2.hours).toEqual({ expected: 25, present: 25, missing: 0 });
    // 00:00–06:00 contient deux fois 02:00 → 7 h HC + 2 h (22:00–24:00) = 9 h
    expect(r2.hphc.hc.kwh).toBe(9);
  });

  it('ignore les créneaux hors période', () => {
    const r = simulate(
      spec56Input({
        period: { from: '2026-01-15', to: '2026-01-15' },
        buckets: hourlySeries('2026-01-10', '2026-01-20', () => 1),
        tempoCalendar: calendar('2026-01-10', '2026-01-20'),
      }),
    );
    expect(r.kwhTotal).toBe(24);
    expect(r.period.days).toBe(1);
  });
});

describe('simulate – validation des entrées', () => {
  it('rejette une période invalide', () => {
    expect(() =>
      simulate(spec56Input({ period: { from: '2026-01-16', to: '2026-01-15' } })),
    ).toThrow(/début/);
    expect(() =>
      simulate(spec56Input({ period: { from: '2026-13-01', to: '2026-01-15' } })),
    ).toThrow(/invalide/);
    expect(() => simulate(spec56Input({ options: { colorSwitchHour: 24 } }))).toThrow(/bascule/);
  });
});
