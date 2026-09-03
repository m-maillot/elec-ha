import { defaultGridFor, TARIF_BLEU_2026_08 } from './tariffs.js';

describe('Tarif Bleu 01/08/2026', () => {
  it('fournit les grilles 6 / 9 / 12 kVA', () => {
    const g6 = defaultGridFor(6)!;
    expect(g6.base).toEqual({ subscriptionYearly: 190.32, prices: { kwh: 0.2001 } });
    expect(g6.hphc.prices).toEqual({ hp: 0.2142, hc: 0.1589 });
    expect(g6.tempo.subscriptionYearly).toBe(189.6);
    expect(g6.tempo.prices).toEqual({
      blueHc: 0.1356,
      blueHp: 0.1654,
      whiteHc: 0.1536,
      whiteHp: 0.1921,
      redHc: 0.1615,
      redHp: 0.7295,
    });
    expect(defaultGridFor(9)!.base.subscriptionYearly).toBe(238.56);
    expect(defaultGridFor(12)!.tempo.subscriptionYearly).toBe(282);
  });
  it('ne fournit rien pour 3 / 15 / 18 kVA', () => {
    expect(defaultGridFor(3)).toBeUndefined();
    expect(defaultGridFor(15)).toBeUndefined();
    expect(defaultGridFor(18)).toBeUndefined();
  });
  it('renvoie une copie indépendante', () => {
    const g = defaultGridFor(6)!;
    g.base.prices.kwh = 1;
    expect(TARIF_BLEU_2026_08[6]!.base.prices.kwh).toBe(0.2001);
  });
});
