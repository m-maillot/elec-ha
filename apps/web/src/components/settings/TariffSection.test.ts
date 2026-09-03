import { TARIF_BLEU_2026_08 } from '@elec-ha/core';
import { formToGrid, gridToForm } from './TariffSection.js';

describe('TariffSection – conversion formulaire ↔ grille', () => {
  it('fait un aller-retour sans perte', () => {
    const grid = TARIF_BLEU_2026_08[6]!;
    const form = gridToForm(grid);
    expect(form.redHp).toBe('0.7295');
    expect(form.baseSub).toBe('190.32');
    expect(formToGrid(form, '2026-08-01')).toEqual(grid);
  });
  it('accepte la virgule décimale et refuse les valeurs invalides', () => {
    const form = { ...gridToForm(TARIF_BLEU_2026_08[6]!), hp: '0,2142' };
    expect(formToGrid(form, '')?.hphc.prices.hp).toBe(0.2142);
    expect(formToGrid({ ...form, hc: '' }, '')).toBeNull();
    expect(formToGrid({ ...form, hc: '-1' }, '')).toBeNull();
  });
});
