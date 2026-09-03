import { simulate } from './simulate.js';
import { calendar, grid6, hourlySeries, offpeak22_6 } from './__fixtures__/series.js';
import { eachDay } from './dates.js';
import type { TempoColor } from './types.js';

describe('performance', () => {
  it('simule 12 mois (8 760 h) en moins de 200 ms', () => {
    const from = '2025-09-01';
    const to = '2026-08-31';
    // Profil pseudo-aléatoire déterministe
    let seed = 42;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    const buckets = hourlySeries(from, to, () => 0.2 + rnd() * 2);
    const colors: TempoColor[] = ['blue', 'blue', 'blue', 'white', 'red'];
    const cal: Record<string, TempoColor> = {};
    for (const d of eachDay('2025-08-31', to)) cal[d] = colors[Math.floor(rnd() * colors.length)]!;

    const input = {
      period: { from, to },
      buckets,
      grid: grid6,
      offpeak: offpeak22_6,
      tempoCalendar: calendar('2025-08-31', to, cal),
      currentOption: 'hphc' as const,
    };
    // Échauffement (JIT, cache des décalages)
    simulate(input);
    const t0 = performance.now();
    const r = simulate(input);
    const elapsed = performance.now() - t0;

    expect(r.hours.expected).toBe(8760);
    expect(r.hours.missing).toBe(0);
    expect(r.period.days).toBe(365);
    expect(elapsed).toBeLessThan(200);
  });
});
