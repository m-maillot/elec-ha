import { LocalClock } from './time.js';

const clock = new LocalClock('Europe/Paris');

describe('LocalClock (Europe/Paris)', () => {
  it('convertit un instant d’hiver (UTC+1)', () => {
    // 2026-01-15T21:00Z = 22:00 heure de Paris
    expect(clock.toLocal(Date.UTC(2026, 0, 15, 21))).toEqual({
      date: '2026-01-15',
      minuteOfDay: 22 * 60,
    });
    // 2026-01-15T23:30Z = 00:30 le 16
    expect(clock.toLocal(Date.UTC(2026, 0, 15, 23, 30))).toEqual({
      date: '2026-01-16',
      minuteOfDay: 30,
    });
  });
  it('convertit un instant d’été (UTC+2)', () => {
    expect(clock.toLocal(Date.UTC(2026, 6, 1, 22))).toEqual({ date: '2026-07-02', minuteOfDay: 0 });
  });
  it('gère les jours de 23 h et 25 h', () => {
    expect(clock.hoursInDay('2026-03-29')).toBe(23); // passage à l'heure d'été
    expect(clock.hoursInDay('2026-10-25')).toBe(25); // retour à l'heure d'hiver
    expect(clock.hoursInDay('2026-06-15')).toBe(24);
  });
  it('calcule minuit local en UTC', () => {
    expect(clock.localMidnightUtcMs('2026-01-15')).toBe(Date.UTC(2026, 0, 14, 23));
    expect(clock.localMidnightUtcMs('2026-07-15')).toBe(Date.UTC(2026, 6, 14, 22));
    // Le jour de transition : minuit du 29/03 est encore en UTC+1, minuit du 30/03 en UTC+2
    expect(clock.localMidnightUtcMs('2026-03-29')).toBe(Date.UTC(2026, 2, 28, 23));
    expect(clock.localMidnightUtcMs('2026-03-30')).toBe(Date.UTC(2026, 2, 29, 22));
  });
  it('rejette un fuseau inconnu', () => {
    expect(() => new LocalClock('Mars/Olympus')).toThrow(/Fuseau/);
  });
});
