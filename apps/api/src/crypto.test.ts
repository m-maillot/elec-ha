import { createSecretCipher } from './crypto.js';

describe('createSecretCipher', () => {
  const cipher = createSecretCipher('une-clef-de-test-suffisamment-longue');
  it('chiffre puis déchiffre', () => {
    const enc = cipher.encrypt('token-très-secret');
    expect(enc).toMatch(/^v1:/);
    expect(enc).not.toContain('secret');
    expect(cipher.decrypt(enc)).toBe('token-très-secret');
  });
  it('produit un chiffré différent à chaque appel (IV aléatoire)', () => {
    expect(cipher.encrypt('x')).not.toBe(cipher.encrypt('x'));
  });
  it('refuse une autre clé ou un payload altéré', () => {
    const enc = cipher.encrypt('abc');
    expect(() => createSecretCipher('autre-clef-tout-aussi-longue').decrypt(enc)).toThrow();
    expect(() => cipher.decrypt(enc.slice(0, -2) + 'AA')).toThrow();
    expect(() => cipher.decrypt('n/a')).toThrow(/Format/);
  });
});
