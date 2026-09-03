import type { SubscribedPower, TariffGrid } from './types.js';

/**
 * Tarif Bleu EDF au 1er août 2026 (€ TTC), d'après les sources publiques citées dans la spec (§11).
 *
 * ⚠️ Valeurs indicatives, constantes de l'application à mettre à jour à chaque révision du tarif
 * réglementé. Elles ne constituent pas une source de vérité : l'utilisateur reste responsable de
 * la grille qu'il saisit. Seules les puissances 6, 9 et 12 kVA disposent de valeurs par défaut.
 */
export const TARIF_BLEU_VALID_FROM = '2026-08-01';

const KWH = {
  hphc: { hp: 0.2142, hc: 0.1589 },
  tempo: {
    blueHc: 0.1356,
    blueHp: 0.1654,
    whiteHc: 0.1536,
    whiteHp: 0.1921,
    redHc: 0.1615,
    redHp: 0.7295,
  },
} as const;

export const TARIF_BLEU_2026_08: Partial<Record<SubscribedPower, TariffGrid>> = {
  6: {
    validFrom: TARIF_BLEU_VALID_FROM,
    base: { subscriptionYearly: 190.32, prices: { kwh: 0.2001 } },
    hphc: { subscriptionYearly: 190.32, prices: { ...KWH.hphc } },
    tempo: { subscriptionYearly: 189.6, prices: { ...KWH.tempo } },
  },
  9: {
    validFrom: TARIF_BLEU_VALID_FROM,
    base: { subscriptionYearly: 238.56, prices: { kwh: 0.1985 } },
    hphc: { subscriptionYearly: 238.56, prices: { ...KWH.hphc } },
    tempo: { subscriptionYearly: 236.4, prices: { ...KWH.tempo } },
  },
  12: {
    validFrom: TARIF_BLEU_VALID_FROM,
    base: { subscriptionYearly: 285.12, prices: { kwh: 0.1985 } },
    hphc: { subscriptionYearly: 285.12, prices: { ...KWH.hphc } },
    tempo: { subscriptionYearly: 282.0, prices: { ...KWH.tempo } },
  },
};

/** Grille par défaut pour une puissance, ou `undefined` si aucune valeur n'est embarquée. */
export function defaultGridFor(power: SubscribedPower): TariffGrid | undefined {
  const grid = TARIF_BLEU_2026_08[power];
  return grid ? structuredClone(grid) : undefined;
}
