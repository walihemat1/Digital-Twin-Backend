import { createHash } from 'crypto';

/** Deterministic hash for duplicate national-ID detection (issuing country + normalized ID). */
export function buildIdentificationNumberHash(
  issuingCountry: string,
  identificationNumber: string,
): string {
  const country = issuingCountry.trim().toUpperCase();
  const id = identificationNumber.trim().toUpperCase();
  return createHash('sha256').update(`${country}|${id}`).digest('hex');
}
