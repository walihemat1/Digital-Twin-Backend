import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Country, State } from 'country-state-city';
import { Repository } from 'typeorm';
import { buildNormalizedPhoneFromParts } from '../auth/registration/phone-number.util';
import { AuditService } from '../audit/audit.service';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { UserRole } from '../../common/enums/user-role.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { User } from '../users/entities/user.entity';
import { CreateRecipientDto } from './dto/create-recipient.dto';
import { UpdateRecipientDto } from './dto/update-recipient.dto';
import { Recipient } from './entities/recipient.entity';
import { buildIdentificationNumberHash } from './recipient-identification.util';
import { RecipientIdentityCryptoService } from './recipient-identity-crypto.service';
import {
  RecipientListSort,
  RecipientListStatusFilter,
  RecipientSearchVisibility,
  RecipientsRepository,
} from './recipients.repository';

const ENTITY_TYPE_RECIPIENT = 'recipient';
const ACTOR_TYPE_USER = 'user';

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
  issuing_country: string | null;
  location: string | null;
  country_code: string | null;
  state_province_code: string | null;
  city_town: string | null;
  zip_code: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
};

export type RecipientLinkedTransactionView = {
  id: string;
  status: string;
  amount: string;
  currency: string;
  submitted_at: Date | null;
  created_at: Date;
};

export type RecipientActivityView = {
  id: string;
  action_type: string;
  actor_user_id: string | null;
  actor_type: string;
  created_at: Date;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
};

export type RecipientDetailView = RecipientPublicView & {
  linked_transactions: RecipientLinkedTransactionView[];
  activity_history: RecipientActivityView[];
  transaction_count: number;
  can_delete: boolean;
  can_deactivate: boolean;
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
    private readonly audit: AuditService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  private visibilityFor(
    authUser: AuthenticatedUser,
  ): RecipientSearchVisibility {
    if (authUser.role === UserRole.ADMIN) {
      return { mode: 'admin' };
    }
    return { mode: 'user', userId: authUser.userId };
  }

  private actorTypeFor(authUser: AuthenticatedUser): string {
    return authUser.role === UserRole.ADMIN ? 'admin_user' : ACTOR_TYPE_USER;
  }

  private auditSnapshot(view: RecipientPublicView): Record<string, unknown> {
    return {
      ...view,
      identification_number: view.identification_number ? '[REDACTED]' : null,
    };
  }

  private async assertRecipientManageAccess(
    recipientId: string,
    authUser: AuthenticatedUser,
  ): Promise<Recipient> {
    const visibility = this.visibilityFor(authUser);
    const row = await this.recipients.findByIdForUser(recipientId, visibility);
    if (!row) {
      throw new NotFoundException('Recipient not found.');
    }
    return row;
  }

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
      issuing_country: entity.issuingCountry?.trim() || null,
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
    opts: {
      limit: number;
      page: number;
      status?: RecipientListStatusFilter;
      sortBy?: RecipientListSort['sortBy'];
      sortDir?: 'asc' | 'desc';
    },
    authUser: AuthenticatedUser,
  ): Promise<PaginatedRecipientsView> {
    const limit = Math.min(Math.max(opts.limit, 1), 50);
    const page = Math.max(opts.page, 1);
    const visibility = this.visibilityFor(authUser);
    const statusFilter = opts.status ?? 'active';
    const sort: RecipientListSort = {
      sortBy: opts.sortBy ?? 'updated_at',
      sortDir: (opts.sortDir ?? 'desc').toUpperCase() === 'ASC' ? 'ASC' : 'DESC',
    };
    const { items, total } = await this.recipients.listByQueryPaged(
      rawQuery,
      limit,
      page,
      visibility,
      statusFilter,
      sort,
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

  async getById(
    recipientId: string,
    authUser: AuthenticatedUser,
  ): Promise<RecipientDetailView> {
    const row = await this.assertRecipientManageAccess(recipientId, authUser);
    const visibility = this.visibilityFor(authUser);
    const transactionCount =
      await this.recipients.countTransactionsForRecipient(recipientId);
    const linked = await this.recipients.listTransactionsForRecipient(
      recipientId,
      visibility,
    );
    const auditRows = await this.audit.listForEntity(
      ENTITY_TYPE_RECIPIENT,
      recipientId,
    );

    const base = this.toPublicView(row);
    return {
      ...base,
      linked_transactions: linked.map((t) => ({
        id: t.id,
        status: t.status,
        amount: t.amount,
        currency: t.currency,
        submitted_at: t.submittedAt,
        created_at: t.createdAt,
      })),
      activity_history: auditRows.map((a) => ({
        id: a.id,
        action_type: a.actionType,
        actor_user_id: a.actorUserId,
        actor_type: a.actorType,
        created_at: a.createdAt,
        old_values: a.oldValues,
        new_values: a.newValues,
      })),
      transaction_count: transactionCount,
      can_delete: transactionCount === 0,
      can_deactivate: row.isActive,
    };
  }

  async grantRecipientCoordinatorAccess(
    actor: AuthenticatedUser,
    recipientId: string,
    targetUserId: string,
  ): Promise<{ recipient_id: string; user_id: string }> {
    if (actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only administrators can grant recipient access.');
    }

    const recipient = await this.recipients.findActiveById(recipientId);
    if (!recipient) {
      throw new NotFoundException('Recipient not found.');
    }

    const target = await this.users.findOne({ where: { id: targetUserId } });
    if (!target) {
      throw new NotFoundException('User not found.');
    }
    if (target.role !== UserRole.COORDINATOR_SENDER) {
      throw new BadRequestException(
        'Recipient directory access can only be granted to Coordinator/Sender accounts.',
      );
    }

    await this.recipients.grantCoordinatorAccess(recipientId, targetUserId);
    await this.audit.append({
      actorUserId: actor.userId,
      actorType: this.actorTypeFor(actor),
      entityType: ENTITY_TYPE_RECIPIENT,
      entityId: recipientId,
      actionType: 'recipient.coordinator_access_granted',
      newValues: { user_id: targetUserId },
    });
    return { recipient_id: recipientId, user_id: targetUserId };
  }

  private validateIdentityPair(issuing?: string, idPlain?: string): void {
    const issuingTrim = issuing?.trim() ?? '';
    const idTrim = idPlain?.trim() ?? '';
    if (!!issuingTrim !== !!idTrim) {
      throw new BadRequestException(
        'issuing_country and identification_number must both be provided or both omitted.',
      );
    }
  }

  private validateWhatsAppPair(wcc?: string, wn?: string): void {
    const wccTrim = wcc?.trim() ?? '';
    const wnTrim = wn?.trim() ?? '';
    if (!!wccTrim !== !!wnTrim) {
      throw new BadRequestException(
        'WhatsApp country code and WhatsApp number must both be provided or both omitted.',
      );
    }
  }

  private resolveStateProvince(
    countryCode: string,
    stateProvinceCode?: string,
  ): string | null {
    const subdivisions = State.getStatesOfCountry(countryCode) ?? [];
    if (subdivisions.length > 0) {
      const stc = stateProvinceCode?.trim() ?? '';
      if (!stc) {
        throw new BadRequestException(
          'State/Province is required for the selected country.',
        );
      }
      if (!State.getStateByCodeAndCountry(stc, countryCode)) {
        throw new BadRequestException(
          'Invalid state/province for the selected country.',
        );
      }
      return stc;
    }
    if (stateProvinceCode?.trim()) {
      throw new BadRequestException(
        'State/Province is not used for the selected country.',
      );
    }
    return null;
  }

  private async assertUniqueContactFields(
    fields: {
      normalizedPhone?: string;
      email?: string;
      identificationHash?: string | null;
    },
    authUser: AuthenticatedUser,
    excludeRecipientId?: string,
  ): Promise<void> {
    if (fields.normalizedPhone) {
      const existing = await this.recipients.findActiveByNormalizedPhone(
        fields.normalizedPhone,
        excludeRecipientId,
      );
      if (existing) {
        if (excludeRecipientId && existing.id === excludeRecipientId) {
          return;
        }
        if (
          authUser.role !== UserRole.ADMIN &&
          !(await this.recipients.isRecipientVisibleToCoordinatorUser(
            existing.id,
            authUser.userId,
          ))
        ) {
          throw new ForbiddenException(
            'A recipient with this phone number already exists. Contact an administrator if you need access to that profile.',
          );
        }
        throw new ConflictException(
          'A recipient with this phone number already exists.',
        );
      }
    }

    if (fields.email?.trim()) {
      const byEmail = await this.recipients.findByNormalizedEmail(
        fields.email,
        excludeRecipientId,
      );
      if (byEmail) {
        throw new ConflictException('A recipient with this email already exists.');
      }
    }

    if (fields.identificationHash) {
      const byId = await this.recipients.findByIdentificationHash(
        fields.identificationHash,
        excludeRecipientId,
      );
      if (byId) {
        throw new ConflictException(
          'A recipient with this identification number already exists.',
        );
      }
    }
  }

  async create(
    dto: CreateRecipientDto,
    authUser: AuthenticatedUser,
  ): Promise<RecipientPublicView> {
    this.validateIdentityPair(dto.issuingCountry, dto.identificationNumber);
    this.validateWhatsAppPair(dto.whatsappCountryCode, dto.whatsappNumber);

    const normalizedPhone = buildNormalizedPhoneFromParts(
      dto.phoneCountryCode,
      dto.phoneNumber,
    );

    const issuing = dto.issuingCountry?.trim() ?? '';
    const idPlain = dto.identificationNumber?.trim() ?? '';
    const idHash =
      issuing && idPlain
        ? buildIdentificationNumberHash(issuing, idPlain)
        : null;

    await this.assertUniqueContactFields(
      {
        normalizedPhone,
        email: dto.email,
        identificationHash: idHash,
      },
      authUser,
    );

    const countryMeta = Country.getCountryByCode(dto.countryCode);
    if (!countryMeta) {
      throw new BadRequestException('Invalid country selection.');
    }
    const stateProvince = this.resolveStateProvince(
      dto.countryCode,
      dto.stateProvinceCode,
    );

    let identificationNumberEncrypted: string | null = null;
    if (idPlain) {
      identificationNumberEncrypted = this.identityCrypto.encrypt(idPlain);
    }

    let whatsappNormalized: string | null = null;
    const wcc = dto.whatsappCountryCode?.trim() ?? '';
    const wn = dto.whatsappNumber?.trim() ?? '';
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
    entity.identificationNumberHash = idHash;
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
    entity.createdByUserId = authUser.userId;

    const saved = await this.recipients.save(entity);
    const view = this.toPublicView(saved);
    await this.audit.append({
      actorUserId: authUser.userId,
      actorType: this.actorTypeFor(authUser),
      entityType: ENTITY_TYPE_RECIPIENT,
      entityId: saved.id,
      actionType: 'recipient.created',
      newValues: this.auditSnapshot(view),
    });
    return view;
  }

  async update(
    recipientId: string,
    dto: UpdateRecipientDto,
    authUser: AuthenticatedUser,
  ): Promise<RecipientPublicView> {
    const keys = Object.keys(dto).filter(
      (k) => (dto as Record<string, unknown>)[k] !== undefined,
    );
    if (keys.length === 0) {
      throw new BadRequestException('At least one field must be provided to update.');
    }

    const row = await this.assertRecipientManageAccess(recipientId, authUser);
    const before = this.auditSnapshot(this.toPublicView(row));

    if (
      dto.issuingCountry !== undefined ||
      dto.identificationNumber !== undefined
    ) {
      const issuing =
        dto.issuingCountry !== undefined
          ? dto.issuingCountry
          : row.issuingCountry ?? undefined;
      const idNum =
        dto.identificationNumber !== undefined
          ? dto.identificationNumber
          : row.identificationNumberEncrypted
            ? this.identityCrypto.decrypt(row.identificationNumberEncrypted)
            : undefined;
      this.validateIdentityPair(issuing, idNum);
    }

    if (
      dto.whatsappCountryCode !== undefined ||
      dto.whatsappNumber !== undefined
    ) {
      const wcc =
        dto.whatsappCountryCode !== undefined
          ? dto.whatsappCountryCode
          : undefined;
      const wn =
        dto.whatsappNumber !== undefined ? dto.whatsappNumber : undefined;
      if (wcc !== undefined || wn !== undefined) {
        this.validateWhatsAppPair(wcc, wn);
      }
    }

    let normalizedPhone: string | undefined;
    if (dto.phoneCountryCode !== undefined && dto.phoneNumber !== undefined) {
      normalizedPhone = buildNormalizedPhoneFromParts(
        dto.phoneCountryCode,
        dto.phoneNumber,
      );
    }

    let idHash: string | null | undefined;
    if (dto.issuingCountry !== undefined || dto.identificationNumber !== undefined) {
      const issuing =
        (dto.issuingCountry !== undefined
          ? dto.issuingCountry?.trim()
          : row.issuingCountry?.trim()) ?? '';
      const idPlain =
        dto.identificationNumber !== undefined
          ? dto.identificationNumber?.trim() ?? ''
          : row.identificationNumberEncrypted
            ? this.identityCrypto.decrypt(row.identificationNumberEncrypted)
            : '';
      if (issuing && idPlain) {
        idHash = buildIdentificationNumberHash(issuing, idPlain);
      } else {
        idHash = null;
      }
    }

    const phoneChanged =
      normalizedPhone != null && normalizedPhone !== row.normalizedPhone;
    const emailChanged =
      dto.email !== undefined &&
      (dto.email?.trim().toLowerCase() ?? '') !==
        (row.email?.trim().toLowerCase() ?? '');
    const idHashChanged =
      idHash !== undefined && idHash !== row.identificationNumberHash;

    if (phoneChanged || emailChanged || idHashChanged) {
      await this.assertUniqueContactFields(
        {
          normalizedPhone: phoneChanged ? normalizedPhone : undefined,
          email: emailChanged ? dto.email : undefined,
          identificationHash: idHashChanged ? idHash : undefined,
        },
        authUser,
        recipientId,
      );
    }

    if (dto.firstName !== undefined) row.firstName = dto.firstName;
    if (dto.lastName !== undefined) row.lastName = dto.lastName;
    if (normalizedPhone) {
      row.phoneNumber = normalizedPhone;
      row.normalizedPhone = normalizedPhone;
    }
    if (dto.organizationName !== undefined) {
      row.organizationName = dto.organizationName?.trim() || null;
    }
    if (dto.email !== undefined) {
      row.email = dto.email?.trim() || null;
    }
    if (dto.countryCode !== undefined) {
      if (!Country.getCountryByCode(dto.countryCode)) {
        throw new BadRequestException('Invalid country selection.');
      }
      row.countryCode = dto.countryCode;
    }
    if (dto.stateProvinceCode !== undefined || dto.countryCode !== undefined) {
      row.stateProvinceCode = this.resolveStateProvince(
        row.countryCode!,
        dto.stateProvinceCode ?? row.stateProvinceCode ?? undefined,
      );
    }
    if (dto.addressLine1 !== undefined) row.addressLine1 = dto.addressLine1.trim();
    if (dto.addressLine2 !== undefined) {
      row.addressLine2 = dto.addressLine2?.trim() || null;
    }
    if (dto.cityTown !== undefined) row.cityTown = dto.cityTown.trim();
    if (dto.zipCode !== undefined) row.zipCode = dto.zipCode.trim();

    if (dto.whatsappCountryCode !== undefined || dto.whatsappNumber !== undefined) {
      const wcc = dto.whatsappCountryCode?.trim() ?? '';
      const wn = dto.whatsappNumber?.trim() ?? '';
      row.whatsappNumber =
        wcc && wn ? buildNormalizedPhoneFromParts(wcc, wn) : null;
    }

    if (idHash !== undefined) {
      row.identificationNumberHash = idHash;
      if (idHash === null) {
        row.issuingCountry = null;
        row.identificationNumberEncrypted = null;
      } else {
        const issuing =
          (dto.issuingCountry !== undefined
            ? dto.issuingCountry?.trim()
            : row.issuingCountry?.trim()) ?? '';
        const idPlain =
          dto.identificationNumber !== undefined
            ? dto.identificationNumber!.trim()
            : this.identityCrypto.decrypt(row.identificationNumberEncrypted!);
        row.issuingCountry = issuing;
        row.identificationNumberEncrypted = this.identityCrypto.encrypt(idPlain);
      }
    } else if (dto.issuingCountry !== undefined) {
      row.issuingCountry = dto.issuingCountry?.trim() || null;
    }

    const saved = await this.recipients.save(row);
    const after = this.auditSnapshot(this.toPublicView(saved));
    await this.audit.append({
      actorUserId: authUser.userId,
      actorType: this.actorTypeFor(authUser),
      entityType: ENTITY_TYPE_RECIPIENT,
      entityId: recipientId,
      actionType: 'recipient.updated',
      oldValues: before,
      newValues: after,
    });
    return this.toPublicView(saved);
  }

  async remove(
    recipientId: string,
    authUser: AuthenticatedUser,
  ): Promise<{ deleted: true }> {
    const row = await this.assertRecipientManageAccess(recipientId, authUser);
    const txCount =
      await this.recipients.countTransactionsForRecipient(recipientId);

    if (txCount > 0) {
      await this.audit.append({
        actorUserId: authUser.userId,
        actorType: this.actorTypeFor(authUser),
        entityType: ENTITY_TYPE_RECIPIENT,
        entityId: recipientId,
        actionType: 'recipient.delete_attempted',
        metadata: {
          reason: 'has_transactions',
          transaction_count: txCount,
        },
      });
      throw new ConflictException(
        'This recipient cannot be deleted because they have existing or pending transactions.',
      );
    }

    const snapshot = this.auditSnapshot(this.toPublicView(row));
    await this.recipients.remove(row);
    await this.audit.append({
      actorUserId: authUser.userId,
      actorType: this.actorTypeFor(authUser),
      entityType: ENTITY_TYPE_RECIPIENT,
      entityId: recipientId,
      actionType: 'recipient.deleted',
      oldValues: snapshot,
    });
    return { deleted: true };
  }

  async deactivate(
    recipientId: string,
    authUser: AuthenticatedUser,
  ): Promise<RecipientPublicView> {
    const row = await this.assertRecipientManageAccess(recipientId, authUser);
    if (!row.isActive) {
      return this.toPublicView(row);
    }
    const before = this.auditSnapshot(this.toPublicView(row));
    row.isActive = false;
    const saved = await this.recipients.save(row);
    const after = this.auditSnapshot(this.toPublicView(saved));
    await this.audit.append({
      actorUserId: authUser.userId,
      actorType: this.actorTypeFor(authUser),
      entityType: ENTITY_TYPE_RECIPIENT,
      entityId: recipientId,
      actionType: 'recipient.deactivated',
      oldValues: before,
      newValues: after,
    });
    return this.toPublicView(saved);
  }

  async reactivate(
    recipientId: string,
    authUser: AuthenticatedUser,
  ): Promise<RecipientPublicView> {
    const row = await this.assertRecipientManageAccess(recipientId, authUser);
    if (row.isActive) {
      return this.toPublicView(row);
    }
    const before = this.auditSnapshot(this.toPublicView(row));
    row.isActive = true;
    const saved = await this.recipients.save(row);
    const after = this.auditSnapshot(this.toPublicView(saved));
    await this.audit.append({
      actorUserId: authUser.userId,
      actorType: this.actorTypeFor(authUser),
      entityType: ENTITY_TYPE_RECIPIENT,
      entityId: recipientId,
      actionType: 'recipient.reactivated',
      oldValues: before,
      newValues: after,
    });
    return this.toPublicView(saved);
  }
}
