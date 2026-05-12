import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Country, State } from 'country-state-city';
import { buildNormalizedPhoneFromParts } from '../auth/registration/phone-number.util';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { CreateRecipientDto } from './dto/create-recipient.dto';
import { Recipient } from './entities/recipient.entity';
import { RecipientIdentityCryptoService } from './recipient-identity-crypto.service';
import { RecipientsRepository } from './recipients.repository';

export type RecipientPublicView = {
  id: string;
  first_name: string;
  last_name: string;
  phone_number: string;
  normalized_phone: string;
  verification_status: VerificationStatus;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  organization_name: string | null;
  email: string | null;
  whatsapp_number: string | null;
  identification_number: string | null;
  location: string | null;
  country_code: string | null;
  state_province_code: string | null;
  city_town: string | null;
  zip_code: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
};

export type PaginatedRecipientsView = {
  items: RecipientPublicView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

@Injectable()
export class RecipientsService {
  constructor(
    private readonly recipients: RecipientsRepository,
    private readonly identityCrypto: RecipientIdentityCryptoService,
  ) {}

  private formatLocation(entity: Recipient): string | null {
    const parts: string[] = [];
    const cc = entity.countryCode?.trim();
    if (cc) {
      parts.push(Country.getCountryByCode(cc)?.name ?? cc);
    }
    if (cc && entity.stateProvinceCode?.trim()) {
      const st = State.getStateByCodeAndCountry(
        entity.stateProvinceCode.trim(),
        cc,
      );
      if (st?.name) {
        parts.push(st.name);
      }
    }
    if (entity.cityTown?.trim()) {
      parts.push(entity.cityTown.trim());
    }
    return parts.length ? parts.join(' ') : null;
  }

  toPublicView(entity: Recipient): RecipientPublicView {
    let identification_number: string | null = null;
    if (entity.identificationNumberEncrypted) {
      try {
        identification_number = this.identityCrypto.decrypt(
          entity.identificationNumberEncrypted,
        );
      } catch {
        identification_number = null;
      }
    }

    const org = entity.organizationName?.trim() ?? '';
    const em = entity.email?.trim() ?? '';

    return {
      id: entity.id,
      first_name: entity.firstName,
      last_name: entity.lastName,
      phone_number: entity.phoneNumber,
      normalized_phone: entity.normalizedPhone,
      verification_status: entity.verificationStatus,
      is_active: entity.isActive,
      created_at: entity.createdAt,
      updated_at: entity.updatedAt,
      organization_name: org || null,
      email: em || null,
      whatsapp_number: entity.whatsappNumber?.trim() || null,
      identification_number,
      location: this.formatLocation(entity),
      country_code: entity.countryCode?.trim() || null,
      state_province_code: entity.stateProvinceCode?.trim() || null,
      city_town: entity.cityTown?.trim() || null,
      zip_code: entity.zipCode?.trim() || null,
      address_line_1: entity.addressLine1?.trim() || null,
      address_line_2: entity.addressLine2?.trim() || null,
    };
  }

  async searchPaged(
    rawQuery: string,
    opts: { limit: number; page: number },
  ): Promise<PaginatedRecipientsView> {
    const limit = Math.min(Math.max(opts.limit, 1), 50);
    const page = Math.max(opts.page, 1);
    const { items, total } = await this.recipients.searchActiveByQueryPaged(
      rawQuery,
      limit,
      page,
    );
    const totalPages = Math.max(1, Math.ceil(total / limit));
    return {
      items: items.map((r) => this.toPublicView(r)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async create(dto: CreateRecipientDto): Promise<RecipientPublicView> {
    const issuing = dto.issuingCountry?.trim() ?? '';
    const idPlain = dto.identificationNumber?.trim() ?? '';
    if (!!issuing !== !!idPlain) {
      throw new BadRequestException(
        'issuing_country and identification_number must both be provided or both omitted.',
      );
    }

    const wcc = dto.whatsappCountryCode?.trim() ?? '';
    const wn = dto.whatsappNumber?.trim() ?? '';
    if (!!wcc !== !!wn) {
      throw new BadRequestException(
        'WhatsApp country code and WhatsApp number must both be provided or both omitted.',
      );
    }

    const normalizedPhone = buildNormalizedPhoneFromParts(
      dto.phoneCountryCode,
      dto.phoneNumber,
    );

    const existing =
      await this.recipients.findActiveByNormalizedPhone(normalizedPhone);
    if (existing) {
      throw new ConflictException(
        'A recipient with this phone number already exists.',
      );
    }

    const countryMeta = Country.getCountryByCode(dto.countryCode);
    if (!countryMeta) {
      throw new BadRequestException('Invalid country selection.');
    }

    const subdivisions = State.getStatesOfCountry(dto.countryCode) ?? [];
    let stateProvince: string | null = null;
    if (subdivisions.length > 0) {
      const stc = dto.stateProvinceCode?.trim() ?? '';
      if (!stc) {
        throw new BadRequestException(
          'State/Province is required for the selected country.',
        );
      }
      if (!State.getStateByCodeAndCountry(stc, dto.countryCode)) {
        throw new BadRequestException(
          'Invalid state/province for the selected country.',
        );
      }
      stateProvince = stc;
    } else if (dto.stateProvinceCode?.trim()) {
      throw new BadRequestException(
        'State/Province is not used for the selected country.',
      );
    }

    let identificationNumberEncrypted: string | null = null;
    if (idPlain) {
      identificationNumberEncrypted = this.identityCrypto.encrypt(idPlain);
    }

    let whatsappNormalized: string | null = null;
    if (wcc && wn) {
      whatsappNormalized = buildNormalizedPhoneFromParts(wcc, wn);
    }

    const entity = new Recipient();
    entity.firstName = dto.firstName;
    entity.lastName = dto.lastName;
    entity.phoneNumber = normalizedPhone;
    entity.normalizedPhone = normalizedPhone;
    entity.issuingCountry = issuing || null;
    entity.identificationNumberEncrypted = identificationNumberEncrypted;
    entity.verificationStatus = VerificationStatus.UNVERIFIED;
    entity.isActive = true;

    entity.organizationName = dto.organizationName?.trim() || null;
    entity.email = dto.email?.trim() || null;
    entity.whatsappNumber = whatsappNormalized;
    entity.countryCode = dto.countryCode;
    entity.stateProvinceCode = stateProvince;
    entity.addressLine1 = dto.addressLine1.trim();
    entity.addressLine2 = dto.addressLine2?.trim() || null;
    entity.cityTown = dto.cityTown.trim();
    entity.zipCode = dto.zipCode.trim();

    const saved = await this.recipients.save(entity);
    return this.toPublicView(saved);
  }
}
