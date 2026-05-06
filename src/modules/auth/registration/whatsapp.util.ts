import { BadRequestException } from '@nestjs/common';

/**
 * Normalize a WhatsApp number into strict E.164 form.
 * - Accepts already normalized numbers (starting with +).
 * - Otherwise combines a country code with a local/national number.
 * - Strips formatting characters and guards against duplicate country codes.
 */
export function buildNormalizedWhatsappNumber(
  whatsappCountryCode: string,
  whatsappNumber: string,
): string {
  const rawNumber = (whatsappNumber || '').trim();
  const rawCountryCode = (whatsappCountryCode || '').trim();

  const sanitizedNumber = rawNumber.replace(/[()\s-]/g, '');

  // If the user already provided an E.164 value, validate and return it.
  if (sanitizedNumber.startsWith('+')) {
    const digits = sanitizedNumber.replace(/^\++/, '').replace(/[^\d]/g, '');
    if (!digits) {
      throw new BadRequestException(
        'Invalid WhatsApp number: missing digits after country code.',
      );
    }
    if (digits.length < 7 || digits.length > 15) {
      throw new BadRequestException(
        'Invalid WhatsApp number: must be between 7 and 15 digits.',
      );
    }
    return `+${digits}`;
  }

  const digitsCc = rawCountryCode.replace(/[^\d]/g, '');
  const localDigits = sanitizedNumber.replace(/[^\d]/g, '');

  if (!digitsCc || !localDigits) {
    throw new BadRequestException(
      'Invalid WhatsApp number: country code and local number are required.',
    );
  }

  const withoutDupCc = localDigits.startsWith(digitsCc)
    ? localDigits.slice(digitsCc.length)
    : localDigits;

  const trimmedLocal = withoutDupCc.replace(/^0+/, '');
  const effectiveLocal = trimmedLocal.length > 0 ? trimmedLocal : withoutDupCc;

  const combined = `${digitsCc}${effectiveLocal}`;
  if (combined.length < 7 || combined.length > 15) {
    throw new BadRequestException(
      'Invalid WhatsApp number: must be between 7 and 15 digits.',
    );
  }

  return `+${combined}`;
}
