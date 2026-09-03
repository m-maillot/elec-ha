import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * Chiffrement des secrets au repos (token HA, secret RTE) : AES-256-GCM,
 * clé dérivée de APP_SECRET par scrypt. Format : `v1:<iv>:<tag>:<données>` en base64url.
 */
export interface SecretCipher {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
}

export function createSecretCipher(appSecret: string): SecretCipher {
  const key = scryptSync(appSecret, 'elec-ha:secrets:v1', 32);
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();
      return ['v1', iv, tag, data]
        .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
        .join(':');
    },
    decrypt(payload) {
      const [version, iv, tag, data] = payload.split(':');
      if (version !== 'v1' || !iv || !tag || !data) {
        throw new Error('Format de secret chiffré invalide.');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
