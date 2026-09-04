import { simulate, type SimulationInput } from './simulate.js';
import { applySmoothing, groupRedPeriods, simulateWithSmoothing } from './smoothing.js';
import { resolveHours } from './simulate.js';
import {
  calendar,
  grid6,
  offpeak22_6,
  tempoDaySeries,
  type DayProfile,
} from './__fixtures__/series.js';

/** Profils §5.6 : 40 % HP / 60 % HC. */
const p = (total: number): DayProfile => ({ hp: total * 0.4, hc: total * 0.6 });

function input(
  profiles: Record<string, DayProfile>,
  cal: Record<string, 'blue' | 'white' | 'red'>,
  from = '2026-01-10',
  to = '2026-01-20',
): SimulationInput {
  return {
    period: { from, to },
    buckets: tempoDaySeries(from, to, profiles),
    grid: grid6,
    offpeak: offpeak22_6,
    tempoCalendar: calendar('2026-01-09', to, cal),
    currentOption: 'base',
  };
}

describe('groupRedPeriods', () => {
  it('regroupe les jours rouges consécutifs', () => {
    const cal = calendar('2026-01-01', '2026-01-10', {
      '2026-01-03': 'red',
      '2026-01-04': 'red',
      '2026-01-08': 'red',
    });
    expect(groupRedPeriods(cal, '2026-01-01', '2026-01-10')).toEqual([
      ['2026-01-03', '2026-01-04'],
      ['2026-01-08'],
    ]);
  });
});

describe('lissage – exemple de contrôle §5.6', () => {
  const profiles: Record<string, DayProfile> = {
    '2026-01-12': p(30),
    '2026-01-13': p(32),
    '2026-01-14': p(28),
    '2026-01-15': p(10), // jour rouge : effacement
    '2026-01-16': p(34),
    '2026-01-17': p(36),
    '2026-01-18': p(32),
  };

  it('jour rouge isolé : E′ = 32 kWh → 12,438 €', () => {
    const r = simulateWithSmoothing(input(profiles, { '2026-01-15': 'red' }));
    expect(r.smoothing.periods).toEqual([
      {
        days: ['2026-01-15'],
        referencesBefore: ['2026-01-12', '2026-01-13', '2026-01-14'],
        referencesAfter: ['2026-01-16', '2026-01-17', '2026-01-18'],
        smoothed: true,
      },
    ]);
    expect(r.tempo.byColor.red.hpKwh).toBeCloseTo(12.8, 9);
    expect(r.tempo.byColor.red.hcKwh).toBeCloseTo(19.2, 9);
    expect(r.tempo.byColor.red.total).toBeCloseTo(12.4384, 6); // 12,8 × 0,7295 + 19,2 × 0,1615 (la spec arrondit à 12,438)
    expect(r.smoothing.redistributedKwh).toBeCloseTo(22, 9);
    // Sans lissage : 3,887 € pour le jour rouge
    const plain = simulate(input(profiles, { '2026-01-15': 'red' }));
    expect(plain.tempo.byColor.red.total).toBeCloseTo(3.887, 6);
    expect(r.smoothing.costWithoutSmoothing).toBeCloseTo(plain.tempo.total, 9);
    expect(r.tempo.total - r.smoothing.costWithoutSmoothing).toBeCloseTo(12.4384 - 3.887, 6);
    // Base et HP/HC restent calculées sur la série observée
    expect(r.base.total).toBeCloseTo(plain.base.total, 9);
    expect(r.hphc.total).toBeCloseTo(plain.hphc.total, 9);
    expect(r.tempo.deltaVsCurrent!.amount).toBeCloseTo(r.tempo.total - r.base.total, 9);
    expect(r.smoothing.substitutedHours).toHaveLength(24);
    expect(r.warnings).toEqual([]);
  });

  it('deux jours rouges consécutifs partagent les références 12–14 et 17–19', () => {
    const two = { ...profiles, '2026-01-16': p(9), '2026-01-19': p(30) };
    const r = simulateWithSmoothing(input(two, { '2026-01-15': 'red', '2026-01-16': 'red' }));
    expect(r.smoothing.periods[0]).toMatchObject({
      days: ['2026-01-15', '2026-01-16'],
      referencesBefore: ['2026-01-12', '2026-01-13', '2026-01-14'],
      referencesAfter: ['2026-01-17', '2026-01-18', '2026-01-19'],
      smoothed: true,
    });
    // E′ = (30+32+28+36+32+30)/6 = 31,333 kWh appliqué aux deux jours
    expect(r.tempo.byColor.red.hpKwh).toBeCloseTo(2 * 31.3333333 * 0.4, 5);
    expect(r.smoothing.redistributedKwh).toBeCloseTo(2 * 31.3333333 - 19, 5);
  });

  it('saute les jours rouges voisins et les jours sans données ; utilise ce qui existe', () => {
    const profiles2: Record<string, DayProfile> = {
      '2026-01-13': p(20),
      '2026-01-15': p(10),
      '2026-01-17': p(40),
      '2026-01-18': p(10),
    };
    // 14/01 sans données, 16/01 rouge (autre période), 18/01 sans couleur connue
    const inp = input(
      profiles2,
      { '2026-01-15': 'red', '2026-01-16': 'red' },
      '2026-01-13',
      '2026-01-18',
    );
    // Jours sans conso = 0 kWh mais présents ; on rend le 14 réellement absent
    const w14 = [Date.UTC(2026, 0, 14, 5), Date.UTC(2026, 0, 15, 5)];
    inp.buckets = inp.buckets.filter((b) => b.startUtc < w14[0]! || b.startUtc >= w14[1]!);
    const cal = { ...inp.tempoCalendar } as Record<string, 'blue' | 'white' | 'red'>;
    delete cal['2026-01-18'];
    inp.tempoCalendar = cal;
    const r = simulateWithSmoothing(inp, { refDays: 3, searchWindowDays: 14 });
    expect(r.smoothing.periods[0]).toMatchObject({
      days: ['2026-01-15', '2026-01-16'],
      referencesBefore: ['2026-01-13'],
      referencesAfter: ['2026-01-17'],
      smoothed: true,
    });
  });

  it('sans aucune référence, la période est laissée telle quelle et signalée', () => {
    // Deux jours rouges couvrant toute la période : rien avant, rien après
    const r = simulateWithSmoothing(
      input(
        { '2026-01-15': p(10) },
        { '2026-01-15': 'red', '2026-01-16': 'red' },
        '2026-01-15',
        '2026-01-16',
      ),
    );
    expect(r.smoothing.periods[0]).toMatchObject({
      smoothed: false,
      referencesBefore: [],
      referencesAfter: [],
    });
    expect(r.tempo.byColor.red.total).toBeCloseTo(3.887, 6);
    expect(r.smoothing.redistributedKwh).toBe(0);
    expect(r.warnings.map((w) => w.code)).toEqual(['smoothing_no_reference']);
  });

  it('respecte la fenêtre de recherche', () => {
    const far = { '2026-01-01': p(30), '2026-01-15': p(10) };
    // Les jours 02 → 14 sont réellement absents (aucun bucket), pas à 0 kWh
    const base = input(far, { '2026-01-15': 'red' }, '2026-01-01', '2026-01-15');
    base.tempoCalendar = calendar('2025-12-31', '2026-01-15', { '2026-01-15': 'red' });
    base.buckets = base.buckets.filter(
      (b) => b.startUtc < Date.UTC(2026, 0, 2, 5) || b.startUtc >= Date.UTC(2026, 0, 15, 5),
    );
    const r = simulateWithSmoothing(base, { searchWindowDays: 5 });
    expect(r.smoothing.periods[0]!.smoothed).toBe(false);
    const r2 = simulateWithSmoothing(base, { searchWindowDays: 14 });
    expect(r2.smoothing.periods[0]!.referencesBefore).toEqual(['2026-01-01']);
  });
});

describe('jours à consommation nulle', () => {
  it('ne sert jamais de référence (index non mis à jour)', () => {
    // 13 et 14/01 présents mais à 0 kWh, 12/01 valide ; après : 16 à 0, 17 valide
    const profiles = { '2026-01-12': p(30), '2026-01-15': p(10), '2026-01-17': p(34) };
    const r = simulateWithSmoothing(
      input(profiles, { '2026-01-15': 'red' }, '2026-01-11', '2026-01-18'),
    );
    expect(r.smoothing.periods[0]).toMatchObject({
      referencesBefore: ['2026-01-12'],
      referencesAfter: ['2026-01-17'],
      smoothed: true,
    });
    expect(r.tempo.byColor.red.hpKwh).toBeCloseTo(32 * 0.4, 6);
  });
});

describe('références hors de la période analysée', () => {
  it('utilise les jours voisins présents dans les données même hors période', () => {
    const profiles = { '2026-01-14': p(30), '2026-01-15': p(10), '2026-01-16': p(34) };
    const inp = input(profiles, { '2026-01-15': 'red' }, '2026-01-13', '2026-01-17');
    inp.period = { from: '2026-01-15', to: '2026-01-15' }; // seule la journée rouge est analysée
    const r = simulateWithSmoothing(inp);
    expect(r.smoothing.periods[0]).toMatchObject({
      referencesBefore: ['2026-01-14'], // le 13/01 est à 0 kWh : écarté
      referencesAfter: ['2026-01-16'], // le 17/01 n'a que 18 h de données : écarté
      smoothed: true,
    });
    // Profil = (30 + 34) / 2 kWh, appliqué aux heures de la période (HP 06–22 h, HC 22–24 h)
    expect(r.tempo.byColor.red.hpKwh).toBeCloseTo(32 * 0.4, 6);
    expect(r.period.days).toBe(1);
  });
});

describe('applySmoothing – fenêtre de couleur et trous', () => {
  it('substitue les heures de la fenêtre 06:00 → 06:00 J+1 et conserve les trous', () => {
    const profiles = { '2026-01-14': p(24), '2026-01-15': p(0), '2026-01-16': p(24) };
    const inp = input(profiles, { '2026-01-15': 'red' }, '2026-01-14', '2026-01-17');
    // Trou : 15/01 12:00 (heure locale) absent
    const gap = Date.UTC(2026, 0, 15, 11);
    inp.buckets = inp.buckets.map((b) => (b.startUtc === gap ? { ...b, kwh: null } : b));
    const series = resolveHours(inp.buckets, inp.period);
    const r = applySmoothing(series, inp.tempoCalendar, inp.period.from, inp.period.to);
    expect(r.substituted.size).toBe(23);
    expect(r.substituted.has(gap)).toBe(false);
    // Une heure HC de la nuit du 15 au 16 (02:00 le 16/01) est substituée par la moyenne des refs (24 × 0,6 / 8 = 1,8)
    expect(r.substituted.get(Date.UTC(2026, 0, 16, 1))).toBeCloseTo(1.8, 9);
    // Une heure du 16/01 à 10:00 n'est pas touchée
    expect(r.substituted.has(Date.UTC(2026, 0, 16, 9))).toBe(false);
  });
});
