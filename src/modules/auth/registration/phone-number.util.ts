import { BadRequestException } from '@nestjs/common';

const STRICT_E164_RE = /^\+[1-9]\d{6,14}$/;

/**
 * Validate and normalize a phone number that is already in (or parsed to) E.164 form.
 */
export function normalizePhoneToE164(input: string): string {
  const trimmed = (input || '').trim().replace(/\s+/g, '');
  if (!STRICT_E164_RE.test(trimmed)) {
    throw new BadRequestException(
      'Phone number must be in E.164 format (e.g. +93700123456).',
    );
  }
  return trimmed;
}

/**
 * Combine a country calling code with a national number into strict E.164.
 * Accepts a full international number starting with + in the local part.
 */
export function buildNormalizedPhoneFromParts(
  countryCode: string,
  localNumber: string,
): string {
  const rawNumber = (localNumber || '').trim();
  const rawCountryCode = (countryCode || '').trim();

  const sanitizedNumber = rawNumber.replace(/[()\s-]/g, '');

  if (sanitizedNumber.startsWith('+')) {
    const digits = sanitizedNumber.replace(/^\++/, '').replace(/[^\d]/g, '');
    if (!digits) {
      throw new BadRequestException(
        'Invalid phone number: missing digits after country code.',
      );
    }
    if (digits.length < 7 || digits.length > 15) {
      throw new BadRequestException(
        'Invalid phone number: must be between 7 and 15 digits.',
      );
    }
    return normalizePhoneToE164(`+${digits}`);
  }

  const digitsCc = rawCountryCode.replace(/[^\d]/g, '');
  const localDigits = sanitizedNumber.replace(/[^\d]/g, '');

  if (!digitsCc || !localDigits) {
    throw new BadRequestException(
      'Invalid phone number: country code and local number are required.',
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
      'Invalid phone number: must be between 7 and 15 digits.',
    );
  }

  return normalizePhoneToE164(`+${combined}`);
}
