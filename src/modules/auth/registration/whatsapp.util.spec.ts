import { BadRequestException } from '@nestjs/common';
import { buildNormalizedWhatsappNumber } from './whatsapp.util';

describe('buildNormalizedWhatsappNumber', () => {
  it('passes through E.164 numbers', () => {
    expect(buildNormalizedWhatsappNumber('+1', '+13065297175')).toBe(
      '+13065297175',
    );
  });

  it('combines country code and local number', () => {
    expect(buildNormalizedWhatsappNumber('+1', '3065297175')).toBe(
      '+13065297175',
    );
  });

  it('handles country code without plus', () => {
    expect(buildNormalizedWhatsappNumber('1', '3065297175')).toBe(
      '+13065297175',
    );
  });

  it('avoids duplicating country code when local includes it', () => {
    expect(buildNormalizedWhatsappNumber('+1', '13065297175')).toBe(
      '+13065297175',
    );
  });

  it('strips formatting characters', () => {
    expect(buildNormalizedWhatsappNumber('+44', '(0)20 1234 5678')).toBe(
      '+442012345678',
    );
  });

  it('rejects overly long numbers', () => {
    expect(() =>
      buildNormalizedWhatsappNumber('+1', '1234567890123456'),
    ).toThrow(BadRequestException);
  });

  it('rejects when parts are missing', () => {
    expect(() => buildNormalizedWhatsappNumber('', '12345')).toThrow(
      BadRequestException,
    );
    expect(() => buildNormalizedWhatsappNumber('+1', '')).toThrow(
      BadRequestException,
    );
  });
});
