import {
  createOffpeakResolver,
  expandSegments,
  offpeakShare,
  validateOffpeakRanges,
  DEFAULT_TEMPO_OFFPEAK,
} from './offpeak.js';

const h = (hh: number, mm = 0) => hh * 60 + mm;

describe('validateOffpeakRanges', () => {
  it('accepte le créneau national Tempo (8 h)', () => {
    const v = validateOffpeakRanges(DEFAULT_TEMPO_OFFPEAK);
    expect(v.valid).toBe(true);
    expect(v.warnings).toEqual([]);
    expect(v.totalMinutes).toBe(480);
  });
  it('accepte deux plages disjointes et avertit si le total ≠ 8 h', () => {
    const v = validateOffpeakRanges([
      { startMin: h(2), endMin: h(7) },
      { startMin: h(12), endMin: h(14) },
    ]);
    expect(v.valid).toBe(true);
    expect(v.totalMinutes).toBe(7 * 60);
    expect(v.warnings[0]).toMatch(/07:00/);
  });
  it('refuse le chevauchement, y compris autour de minuit', () => {
    const v = validateOffpeakRanges([
      { startMin: h(22, 30), endMin: h(6, 30) },
      { startMin: h(5), endMin: h(8) },
    ]);
    expect(v.valid).toBe(false);
    expect(v.errors[0]).toMatch(/chevauchent/);
  });
  it('refuse fin = début et les bornes hors pas de 30 min', () => {
    expect(validateOffpeakRanges([{ startMin: h(6), endMin: h(6) }]).errors[0]).toMatch(
      /différente/,
    );
    expect(validateOffpeakRanges([{ startMin: h(6, 10), endMin: h(8) }]).errors[0]).toMatch(
      /30 minutes/,
    );
    expect(validateOffpeakRanges([{ startMin: h(6), endMin: h(25) }]).errors[0]).toMatch(/hors/);
  });
  it('accepte 24:00 comme fin', () => {
    const v = validateOffpeakRanges([{ startMin: h(16), endMin: 1440 }]);
    expect(v.valid).toBe(true);
    expect(v.totalMinutes).toBe(480);
  });
});

describe('offpeakShare / createOffpeakResolver', () => {
  it('répartit au prorata sur des plages au pas de 30 min', () => {
    const share = createOffpeakResolver([{ startMin: h(22, 30), endMin: h(6, 30) }]);
    expect(share(h(21))).toBe(0);
    expect(share(h(22))).toBe(0.5);
    expect(share(h(23))).toBe(1);
    expect(share(h(0))).toBe(1);
    expect(share(h(5))).toBe(1);
    expect(share(h(6))).toBe(0.5);
    expect(share(h(7))).toBe(0);
  });
  it('gère plusieurs plages et le créneau 23:00', () => {
    const share = createOffpeakResolver([
      { startMin: h(2), endMin: h(7) },
      { startMin: h(12), endMin: h(14) },
      { startMin: h(23, 30), endMin: h(0, 30) },
    ]);
    expect(share(h(1))).toBe(0);
    expect(share(h(2))).toBe(1);
    expect(share(h(12))).toBe(1);
    expect(share(h(13))).toBe(1);
    expect(share(h(14))).toBe(0);
    expect(share(h(23))).toBe(0.5);
    expect(share(h(0))).toBe(0.5);
  });
  it('sans plage, tout est en HP', () => {
    const share = createOffpeakResolver([]);
    expect(share(h(3))).toBe(0);
  });
  it('expandSegments découpe les plages chevauchant minuit', () => {
    expect(expandSegments([{ startMin: h(22), endMin: h(6) }])).toEqual([
      { start: 0, end: h(6) },
      { start: h(22), end: 1440 },
    ]);
    expect(offpeakShare(expandSegments([{ startMin: h(22), endMin: 0 }]), h(23))).toBe(1);
  });
});
