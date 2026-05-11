import { BadRequestException } from '@nestjs/common';
import { Country, State } from 'country-state-city';

export type RegistrationLocationGeoInput = {
  country: string;
  countryCode: string;
  cityTown: string;
  stateProvince?: string;
  stateProvinceCode?: string | null;
};

/**
 * Ensures country and state/province selections align with the bundled geography dataset.
 * City/town is free text (validated by DTO length rules only).
 */
export function validateRegistrationLocationGeography(
  input: RegistrationLocationGeoInput,
): void {
  const cc = (input.countryCode || '').trim().toUpperCase();
  const countryMeta = Country.getCountryByCode(cc);
  if (!countryMeta) {
    throw new BadRequestException('Please select a valid country or region.');
  }
  if (countryMeta.name.trim() !== input.country.trim()) {
    throw new BadRequestException(
      'Country selection does not match the selected country code.',
    );
  }

  const states = State.getStatesOfCountry(cc);
  if (states.length > 0) {
    const sc = (input.stateProvinceCode || '').trim();
    if (!sc) {
      throw new BadRequestException(
        'State or province is required for the selected country.',
      );
    }
    const stateMeta = states.find((s) => s.isoCode === sc);
    if (!stateMeta) {
      throw new BadRequestException('Please select a valid state or province.');
    }
    const stName = (input.stateProvince || '').trim();
    if (!stName || stateMeta.name.trim() !== stName) {
      throw new BadRequestException(
        'State or province selection is inconsistent.',
      );
    }
  }
}
