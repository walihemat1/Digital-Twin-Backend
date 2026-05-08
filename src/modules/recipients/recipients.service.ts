import { BadRequestException, Injectable } from '@nestjs/common';
import { buildNormalizedWhatsappNumber } from '../auth/registration/whatsapp.util';
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
};

@Injectable()
export class RecipientsService {
  constructor(
    private readonly recipients: RecipientsRepository,
    private readonly identityCrypto: RecipientIdentityCryptoService,
  ) {}

  toPublicView(entity: Recipient): RecipientPublicView {
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
    };
  }

  async search(rawQuery: string, limit = 20): Promise<RecipientPublicView[]> {
    const capped = Math.min(Math.max(limit, 1), 50); // this line caps the limit to 50 and the minimum is 1 because we don't want to return more than 50 recipients. Caps means
    const rows = await this.recipients.searchActiveByQuery(rawQuery, capped);
    return rows.map((r) => this.toPublicView(r));
  }

  async create(dto: CreateRecipientDto): Promise<RecipientPublicView> {
    const issuing = dto.issuingCountry?.trim() ?? '';
    const idPlain = dto.identificationNumber?.trim() ?? '';
    if (!!issuing !== !!idPlain) {
      throw new BadRequestException(
        'issuing_country and identification_number must both be provided or both omitted.',
      );
    }

    const normalizedPhone = buildNormalizedWhatsappNumber(
      dto.phoneCountryCode,
      dto.phoneNumber,
    );

    let identificationNumberEncrypted: string | null = null;
    if (idPlain) {
      identificationNumberEncrypted = this.identityCrypto.encrypt(idPlain);
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

    const saved = await this.recipients.save(entity);
    return this.toPublicView(saved);
  }
}
