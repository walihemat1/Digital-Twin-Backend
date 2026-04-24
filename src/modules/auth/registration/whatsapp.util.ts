/**
 * Builds a single normalized WhatsApp identifier for storage/search.
 * Accepts E.164-style country codes (e.g. +1) and strips non-digits from the local number.
 */
import { BadRequestException } from '@nestjs/common';
export function buildNormalizedWhatsappNumber(
  whatsappCountryCode: string,
  whatsappNumber: string,
): string {
  const cc = whatsappCountryCode.trim();
  const digitsCc = cc.replace(/\D/g, '');

  const digitsLocal = whatsappNumber.trim().replace(/\D/g, '');
  const normalizedDigits = `${digitsCc}${digitsLocal}`;

  if (!digitsCc || !digitsLocal) {
    throw new BadRequestException(
      'Invalid WhatsApp number: missing country/local digits.',
    );
  }

  if (normalizedDigits.length > 15) {
    throw new BadRequestException(
      'Invalid WhatsApp number: exceeds E.164 max length.',
    );
  }

  return `+${normalizedDigits}`;
}
