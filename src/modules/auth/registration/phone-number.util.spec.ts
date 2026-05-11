import { BadRequestException } from '@nestjs/common';
import {
  buildNormalizedPhoneFromParts,
  normalizePhoneToE164,
} from './phone-number.util';

describe('normalizePhoneToE164', () => {
  it('accepts valid E.164', () => {
    expect(normalizePhoneToE164('+13065297175')).toBe('+13065297175');
    expect(normalizePhoneToE164(' +93700123456 ')).toBe('+93700123456');
  });

  it('rejects invalid values', () => {
    expect(() => normalizePhoneToE164('3065297175')).toThrow(
      BadRequestException,
    );
    expect(() => normalizePhoneToE164('+03065297175')).toThrow(
      BadRequestException,
    );
  });
});

describe('buildNormalizedPhoneFromParts', () => {
  it('normalizes explicit international numbers', () => {
    expect(buildNormalizedPhoneFromParts('+1', '+13065297175')).toBe(
      '+13065297175',
    );
    expect(buildNormalizedPhoneFromParts('+1', '3065297175')).toBe(
      '+13065297175',
    );
    expect(buildNormalizedPhoneFromParts('1', '3065297175')).toBe(
      '+13065297175',
    );
    expect(buildNormalizedPhoneFromParts('+1', '13065297175')).toBe(
      '+13065297175',
    );
    expect(buildNormalizedPhoneFromParts('+44', '(0)20 1234 5678')).toBe(
      '+442012345678',
    );
  });

  it('rejects numbers that are too long', () => {
    expect(() =>
      buildNormalizedPhoneFromParts('+1', '1234567890123456'),
    ).toThrow(BadRequestException);
  });

  it('requires parts when not international', () => {
    expect(() => buildNormalizedPhoneFromParts('', '12345')).toThrow(
      BadRequestException,
    );
    expect(() => buildNormalizedPhoneFromParts('+1', '')).toThrow(
      BadRequestException,
    );
  });
});
