import { createHmac, randomBytes } from 'crypto';

const HEX = 'hex' as const;

/**
 * Fingerprint for long random tokens (refresh, password reset) — allows indexed lookup
 * without storing reversible secrets.
 */
export function hashOpaqueToken(raw: string, pepper: string): string {
  return createHmac('sha256', pepper).update(raw).digest(HEX);
}

export function generateUrlSafeToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export function generateSixDigitMfaCode(): string {
  const n = randomBytes(4).readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, '0');
}
