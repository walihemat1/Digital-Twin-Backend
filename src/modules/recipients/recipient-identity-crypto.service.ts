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
const PREFIX = 'v1';

@Injectable()
export class RecipientIdentityCryptoService {
  constructor(private readonly config: ConfigService) {}

  private deriveKey(): Buffer {
    const pepper = this.config.get<string>('RECIPIENT_IDENTITY_ENCRYPTION_KEY');
    if (!pepper) {
      throw new Error('RECIPIENT_IDENTITY_ENCRYPTION_KEY is not configured.');
    }
    return scryptSync(pepper, 'recipient-identity-scrypt-salt', KEY_LENGTH);
  }

  /**
   * Encrypts plaintext identity data for storage in `identification_number_encrypted`.
   * Format: v1:<iv_b64url>:<tag_b64url>:<ciphertext_b64url>
   */
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

  /** Used in tests and future admin/support flows; not exposed on public APIs. */
  decrypt(payload: string): string {
    const parts = payload.split(':');
    if (parts.length !== 4 || parts[0] !== PREFIX) {
      throw new Error('Invalid encrypted identity payload.');
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
