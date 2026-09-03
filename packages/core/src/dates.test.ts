import { addDays, daysInclusive, eachDay, isIsoDate, compareDates } from './dates.js';

describe('dates', () => {
  it('valide le format YYYY-MM-DD', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('26-02-28')).toBe(false);
  });
  it('ajoute des jours en gérant les changements de mois et d’année', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('compte les jours bornes incluses', () => {
    expect(daysInclusive('2026-01-15', '2026-01-15')).toBe(1);
    expect(daysInclusive('2025-09-01', '2026-08-31')).toBe(365);
    expect(eachDay('2026-01-30', '2026-02-01')).toEqual(['2026-01-30', '2026-01-31', '2026-02-01']);
  });
  it('compare des dates', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareDates('2026-01-02', '2026-01-02')).toBe(0);
  });
});
