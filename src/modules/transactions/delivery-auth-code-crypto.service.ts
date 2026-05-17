import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;
const PREFIX = 'dac1';

/**
 * Encrypts Broker B delivery auth codes at rest so they can be shown on the
 * authenticated detail page without storing plaintext.
 */
@Injectable()
export class DeliveryAuthCodeCryptoService {
  constructor(private readonly config: ConfigService) {}

  private deriveKey(): Buffer {
    const pepper = this.config.get<string>('AUTH_OPAQUE_TOKEN_PEPPER');
    if (!pepper) {
      throw new Error('AUTH_OPAQUE_TOKEN_PEPPER is not configured.');
    }
    return scryptSync(pepper, 'delivery-auth-code-scrypt-salt', KEY_LENGTH);
  }

  encrypt(plain: string): string {
    const key = this.deriveKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGO, key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return [
      PREFIX,
      iv.toString('base64url'),
      tag.toString('base64url'),
      ciphertext.toString('base64url'),
    ].join(':');
  }

  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== PREFIX) {
      throw new Error('Invalid encrypted delivery auth code payload.');
    }
    const [, ivB64, tagB64, ctB64] = parts;
    const key = this.deriveKey();
    const iv = Buffer.from(ivB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');
    const ciphertext = Buffer.from(ctB64, 'base64url');
    const decipher = createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(ciphertext) + decipher.final('utf8');
  }
}
