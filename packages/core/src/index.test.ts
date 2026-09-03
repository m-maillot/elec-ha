import { CORE_VERSION, TARIFF_OPTIONS } from './index.js';

describe('@elec-ha/core', () => {
  it('exporte les trois options du Tarif Bleu', () => {
    expect(TARIFF_OPTIONS).toEqual(['base', 'hphc', 'tempo']);
    expect(CORE_VERSION).toBeTypeOf('string');
  });
});
