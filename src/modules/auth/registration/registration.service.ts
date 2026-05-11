import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { AccountStatus } from '../../../common/enums/account-status.enum';
import { ApprovalRequestStatus } from '../../../common/enums/approval-request-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { VerificationStatus } from '../../../common/enums/verification-status.enum';
import { normalizeEmail } from '../../../common/utils/normalization.util';
import authConfig from '../../../config/auth.config';
import { ApprovalRequest } from '../../approval/entities/approval-request.entity';
import { User } from '../../users/entities/user.entity';
import { UserProfile } from '../../users/entities/user-profile.entity';
import { RegistrationContactStepDto } from '../dto/registration-contact-step.dto';
import { RegistrationLocationStepDto } from '../dto/registration-location-step.dto';
import { RegistrationPersonalInfoStepDto } from '../dto/registration-personal-info-step.dto';
import { RegistrationVerifyCodeDto } from '../dto/registration-verify-code.dto';
import { RegistrationRecipientDetailsStepDto } from '../dto/registration-recipient-details-step.dto';
import { RegistrationSendPhoneVerificationDto } from '../dto/registration-send-phone-verification.dto';
import { RegistrationVerifyPhoneDto } from '../dto/registration-verify-phone.dto';
import { SelectRoleDto } from '../dto/select-role.dto';
import { RegistrationSession } from '../entities/registration-session.entity';
import {
  PASSWORD_POLICY_VERSION,
  REGISTRATION_REQUEST_TYPE_COORDINATOR_SENDER,
  REGISTRATION_SELECTABLE_ROLES,
  REGISTRATION_SESSION_TTL_MS,
  RegistrationStep,
} from './registration.constants';
import { RegistrationVerificationService } from './registration-verification.service';
import {
  isPasswordPolicyCompliant,
  passwordPolicyFailureMessage,
} from './password-policy';
import { validateRegistrationLocationGeography } from './registration-location-geo.util';
import { normalizePhoneToE164 } from './phone-number.util';

type ContactPayloadV1 = {
  phoneNumber: string;
};

type PersonalInfoPayloadV1 = {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  passwordPolicyVersion: string;
  /** Present for Coordinator/Sender when provided; otherwise omitted or null. */
  organizationName?: string | null;
};

type LocationPayloadV1 = {
  country: string;
  countryCode: string;
  stateProvince?: string;
  stateProvinceCode?: string;
  addressLine1: string;
  addressLine2?: string;
  cityTown: string;
  zipCode?: string;
  phoneNumber: string;
};

type RecipientDetailsPayloadV1 = {
  issuingCountry: string;
  identificationNumber: string;
};

@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(RegistrationSession)
    private readonly sessions: Repository<RegistrationSession>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(UserProfile)
    private readonly profiles: Repository<UserProfile>,
    private readonly dataSource: DataSource,
    private readonly verification: RegistrationVerificationService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  // create a new registration session
  async createSession(): Promise<RegistrationSession> {
    const now = new Date();
    const session = this.sessions.create({
      selectedRole: null,
      currentStep: RegistrationStep.AWAITING_ROLE,
      contactPayload: null,
      personalInfoPayload: null,
      locationPayload: null,
      recipientDetailsPayload: null,
      phoneVerificationStatus: VerificationStatus.NOT_STARTED,
      phoneVerificationSentAt: null,
      phoneVerifiedAt: null,
      phoneVerificationResendCount: 0,
      emailVerificationStatus: VerificationStatus.NOT_STARTED,
      emailVerificationSentAt: null,
      emailVerifiedAt: null,
      expiresAt: new Date(now.getTime() + REGISTRATION_SESSION_TTL_MS),
    });
    return this.sessions.save(session);
  }

  // select a role for the registration session
  async selectRole(
    id: string,
    dto: SelectRoleDto,
  ): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(id);

    if (session.currentStep !== RegistrationStep.AWAITING_ROLE) {
      throw new BadRequestException('Role has already been selected.');
    }

    if (!REGISTRATION_SELECTABLE_ROLES.includes(dto.role)) {
      throw new BadRequestException('Unsupported registration role.');
    }

    const roleChanged =
      session.selectedRole !== null && session.selectedRole !== dto.role;

    session.selectedRole = dto.role;
    session.currentStep = RegistrationStep.AWAITING_CONTACT;
    session.verificationStatus = VerificationStatus.UNVERIFIED;
    session.phoneVerificationStatus = VerificationStatus.UNVERIFIED;
    session.emailVerificationStatus = VerificationStatus.UNVERIFIED;

    if (roleChanged) {
      session.contactPayload = null;
      session.personalInfoPayload = null;
      session.locationPayload = null;
      session.recipientDetailsPayload = null;
      session.phoneVerificationStatus = VerificationStatus.NOT_STARTED;
      session.phoneVerificationSentAt = null;
      session.phoneVerifiedAt = null;
      session.phoneVerificationResendCount = 0;
      session.emailVerificationStatus = VerificationStatus.NOT_STARTED;
      session.emailVerificationSentAt = null;
      session.emailVerifiedAt = null;
    }

    return this.sessions.save(session);
  }

  async saveContactStep(
    id: string,
    dto: RegistrationContactStepDto,
  ): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(id);

    if (
      session.currentStep === RegistrationStep.AWAITING_ROLE ||
      session.currentStep === null
    ) {
      throw new BadRequestException('Contact step is not available yet.');
    }

    if (!session.selectedRole) {
      throw new BadRequestException('Role must be selected first.');
    }

    const normalized = normalizePhoneToE164(dto.phoneNumber);

    const payload: ContactPayloadV1 = {
      phoneNumber: normalized,
    };

    const existing =
      session.contactPayload as ContactPayloadV1 | Record<string, unknown> | null;
    const numberChanged =
      !existing ||
      (existing as ContactPayloadV1).phoneNumber !== normalized;

    session.contactPayload = payload as unknown as Record<string, unknown>;
    const needsVerification =
      numberChanged ||
      session.phoneVerificationStatus !== VerificationStatus.VERIFIED;

    if (needsVerification) {
      session.phoneVerifiedAt = null;
      session.phoneVerificationSentAt = null;
      session.phoneVerificationResendCount = 0;
      session.phoneVerificationStatus = VerificationStatus.NOT_STARTED;
      session.currentStep = RegistrationStep.AWAITING_PHONE_VERIFICATION;
      return this.sessions.save(session);
    }

    // Already verified and number unchanged; keep progressing if still early in the flow
    if (
      session.currentStep === RegistrationStep.AWAITING_CONTACT ||
      session.currentStep === RegistrationStep.AWAITING_PHONE_VERIFICATION
    ) {
      session.currentStep = RegistrationStep.AWAITING_PERSONAL_INFO;
    }
    return this.sessions.save(session);
  }

  async savePersonalInfoStep(
    id: string,
    dto: RegistrationPersonalInfoStepDto,
  ): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(id);

    if (
      session.phoneVerificationStatus !== VerificationStatus.VERIFIED ||
      (session.currentStep !== RegistrationStep.AWAITING_PERSONAL_INFO &&
        session.currentStep !== RegistrationStep.AWAITING_EMAIL_VERIFICATION)
    ) {
      throw new BadRequestException('Personal info step is not available yet.');
    }

    if (dto.password !== dto.passwordConfirm) {
      throw new BadRequestException('Passwords do not match.');
    }

    if (!isPasswordPolicyCompliant(dto.password)) {
      throw new BadRequestException(passwordPolicyFailureMessage());
    }

    const email = normalizeEmail(dto.email);
    const emailExists = await this.users.exist({ where: { email } });
    if (emailExists) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      this.auth.bcryptSaltRounds,
    );

    const organizationName =
      session.selectedRole === UserRole.COORDINATOR_SENDER
        ? (dto.organizationName ?? null)
        : null;

    const payload: PersonalInfoPayloadV1 = {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      passwordHash,
      passwordPolicyVersion: PASSWORD_POLICY_VERSION,
      ...(session.selectedRole === UserRole.COORDINATOR_SENDER
        ? { organizationName }
        : {}),
    };

    const existing =
      session.personalInfoPayload as
        | (PersonalInfoPayloadV1 & Record<string, unknown>)
        | null;
    const emailChanged = !existing || existing.email !== email;

    session.personalInfoPayload = payload as unknown as Record<string, unknown>;

    if (emailChanged || session.emailVerificationStatus !== VerificationStatus.VERIFIED) {
      session.emailVerifiedAt = null;
      session.emailVerificationSentAt = null;
      session.emailVerificationStatus = VerificationStatus.NOT_STARTED;
      session.currentStep = RegistrationStep.AWAITING_EMAIL_VERIFICATION;
      await this.verification.sendEmailCode(session);
      return this.sessions.findOneOrFail({ where: { id: session.id } });
    }

    if (
      session.currentStep === RegistrationStep.AWAITING_PERSONAL_INFO ||
      session.currentStep === RegistrationStep.AWAITING_EMAIL_VERIFICATION
    ) {
      session.currentStep = RegistrationStep.AWAITING_LOCATION;
    }
    return this.sessions.save(session);
  }

  async sendPhoneVerification(
    id: string,
    dto: RegistrationSendPhoneVerificationDto,
  ): Promise<{
    sent: boolean;
    codeExpiresAt: string;
    resendCooldownSeconds: number;
  }> {
    const session = await this.requireOpenSession(id);
    if (!session.contactPayload) {
      throw new BadRequestException('Contact details are required first.');
    }
    if (session.phoneVerificationStatus === VerificationStatus.VERIFIED) {
      return this.verification.sendPhoneVerificationCode(
        session,
        dto.phoneNumber.trim(),
      );
    }
    session.currentStep = RegistrationStep.AWAITING_PHONE_VERIFICATION;
    return this.verification.sendPhoneVerificationCode(
      session,
      dto.phoneNumber.trim(),
    );
  }

  async resendPhoneVerification(
    id: string,
    dto: RegistrationSendPhoneVerificationDto,
  ): Promise<{
    sent: boolean;
    codeExpiresAt: string;
    resendCooldownSeconds: number;
  }> {
    return this.sendPhoneVerification(id, dto);
  }

  async verifyPhoneCode(
    id: string,
    dto: RegistrationVerifyPhoneDto,
  ): Promise<{ verified: boolean; message?: string }> {
    const session = await this.requireOpenSession(id);
    const result = await this.verification.verifyPhoneCode(
      session,
      dto.phoneNumber.trim(),
      dto.code.trim(),
    );
    if (result.verified) {
      session.currentStep = RegistrationStep.AWAITING_PERSONAL_INFO;
      await this.sessions.save(session);
    }
    return result;
  }

  async sendEmailVerification(id: string): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(id);
    if (!session.personalInfoPayload) {
      throw new BadRequestException('Personal information is required first.');
    }
    if (session.emailVerificationStatus === VerificationStatus.VERIFIED) {
      return session;
    }
    session.currentStep = RegistrationStep.AWAITING_EMAIL_VERIFICATION;
    await this.verification.sendEmailCode(session);
    return this.sessions.findOneOrFail({ where: { id: session.id } });
  }

  async resendEmailVerification(id: string): Promise<RegistrationSession> {
    return this.sendEmailVerification(id);
  }

  async verifyEmailCode(
    id: string,
    dto: RegistrationVerifyCodeDto,
  ): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(id);
    const result = await this.verification.verifyEmailCode(
      session,
      dto.code.trim(),
    );
    if (result.verifiedAt) {
      session.currentStep = RegistrationStep.AWAITING_LOCATION;
      await this.sessions.save(session);
    }
    return this.sessions.findOneOrFail({ where: { id: session.id } });
  }

  async saveLocationStep(
    id: string,
    dto: RegistrationLocationStepDto,
  ): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(id);

    if (session.emailVerificationStatus !== VerificationStatus.VERIFIED) {
      throw new BadRequestException('Email verification is required before continuing.');
    }

    if (session.currentStep !== RegistrationStep.AWAITING_LOCATION) {
      throw new BadRequestException('Location step is not available yet.');
    }

    const contact =
      session.contactPayload as unknown as ContactPayloadV1 | null;
    const verifiedPhone = contact?.phoneNumber?.trim();
    if (!verifiedPhone) {
      throw new BadRequestException(
        'Phone verification is required before saving your location.',
      );
    }
    let normalizedLocationPhone: string;
    try {
      normalizedLocationPhone = normalizePhoneToE164(dto.phoneNumber);
    } catch {
      throw new BadRequestException('Phone number is not valid.');
    }
    if (normalizedLocationPhone !== verifiedPhone) {
      throw new BadRequestException(
        'The phone number must match the number verified earlier in registration.',
      );
    }

    const cc = (dto.countryCode || '').trim().toUpperCase();
    if (cc.length !== 2) {
      throw new BadRequestException('Country code is required.');
    }

    validateRegistrationLocationGeography({
      country: dto.country,
      countryCode: cc,
      cityTown: dto.cityTown,
      stateProvince: dto.stateProvince,
      stateProvinceCode: dto.stateProvinceCode,
    });

    const payload: LocationPayloadV1 = {
      country: dto.country.trim(),
      countryCode: cc,
      stateProvince: dto.stateProvince?.trim(),
      stateProvinceCode: dto.stateProvinceCode?.trim() || undefined,
      addressLine1: dto.addressLine1.trim(),
      addressLine2: dto.addressLine2?.trim(),
      cityTown: dto.cityTown.trim(),
      zipCode: dto.zipCode?.trim(),
      phoneNumber: normalizedLocationPhone,
    };

    session.locationPayload = payload as unknown as Record<string, unknown>;
    session.currentStep =
      session.selectedRole === UserRole.RECIPIENT
        ? RegistrationStep.AWAITING_RECIPIENT_DETAILS
        : RegistrationStep.READY_TO_COMPLETE;

    return this.sessions.save(session);
  }

  async saveRecipientDetailsStep(
    id: string,
    dto: RegistrationRecipientDetailsStepDto,
  ): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(id);

    if (session.currentStep !== RegistrationStep.AWAITING_RECIPIENT_DETAILS) {
      throw new BadRequestException(
        'Recipient identification step is not available yet.',
      );
    }
    if (session.selectedRole !== UserRole.RECIPIENT) {
      throw new BadRequestException(
        'This step is only for recipient registration.',
      );
    }

    const issuingCountry = dto.issuingCountry.trim();
    const identificationNumber = dto.identificationNumber.trim();

    const duplicate = await this.profiles
      .createQueryBuilder('p')
      .innerJoin('p.user', 'u')
      .where('u.role = :r', { r: UserRole.RECIPIENT })
      .andWhere('p.issuingCountry = :c', { c: issuingCountry })
      .andWhere('p.identificationNumber = :n', { n: identificationNumber })
      .getExists();
    if (duplicate) {
      throw new ConflictException(
        'This identification number is already registered for the selected country.',
      );
    }

    const rec: RecipientDetailsPayloadV1 = {
      issuingCountry,
      identificationNumber,
    };
    session.recipientDetailsPayload = rec as unknown as Record<string, unknown>;
    session.currentStep = RegistrationStep.READY_TO_COMPLETE;
    return this.sessions.save(session);
  }

  async completeRegistration(
    id: string,
  ): Promise<{ userId: string; accountStatus: AccountStatus }> {
    const session = await this.requireOpenSession(id);

    if (session.currentStep !== RegistrationStep.READY_TO_COMPLETE) {
      throw new BadRequestException('Registration is not ready to complete.');
    }

    const contact =
      session.contactPayload as unknown as ContactPayloadV1 | null;
    const personal =
      session.personalInfoPayload as unknown as PersonalInfoPayloadV1 | null;
    const location =
      session.locationPayload as unknown as LocationPayloadV1 | null;
    const recipient =
      session.recipientDetailsPayload as unknown as RecipientDetailsPayloadV1 | null;

    if (!session.selectedRole || !contact || !personal || !location) {
      throw new BadRequestException('Registration data is incomplete.');
    }
    if (session.selectedRole === UserRole.RECIPIENT && !recipient) {
      throw new BadRequestException('Registration data is incomplete.');
    }
    if (
      session.phoneVerificationStatus !== VerificationStatus.VERIFIED ||
      session.emailVerificationStatus !== VerificationStatus.VERIFIED
    ) {
      throw new BadRequestException('Verification steps are not complete.');
    }

    if (session.phoneVerificationStatus !== VerificationStatus.VERIFIED) {
      throw new BadRequestException('Phone verification is required.');
    }
    if (session.emailVerificationStatus !== VerificationStatus.VERIFIED) {
      throw new BadRequestException('Email verification is required.');
    }

    const accountStatus =
      session.selectedRole === UserRole.COORDINATOR_SENDER
        ? AccountStatus.PENDING_APPROVAL
        : AccountStatus.ACTIVE;

    const userId = await this.dataSource.transaction(async (manager) => {
      const users = manager.getRepository(User);
      const profiles = manager.getRepository(UserProfile);
      const approvals = manager.getRepository(ApprovalRequest);
      const registrationSessions = manager.getRepository(RegistrationSession);

      const email = personal.email;
      const existing = await users.exist({ where: { email } });
      if (existing) {
        throw new ConflictException('Email is already registered.');
      }

      const user = users.create({
        role: session.selectedRole!,
        accountStatus,
        firstName: personal.firstName,
        lastName: personal.lastName,
        email,
        passwordHash: personal.passwordHash,
        passwordPolicyVersion: personal.passwordPolicyVersion,
        lastLoginAt: null,
        failedAttemptCount: 0,
      });

      const savedUser = await users.save(user);

      const profile = profiles.create({
        userId: savedUser.id,
        organizationName:
          session.selectedRole === UserRole.COORDINATOR_SENDER
            ? personal.organizationName ?? null
            : null,
        country: location.country,
        stateProvince: location.stateProvince ?? null,
        addressLine1: location.addressLine1,
        addressLine2: location.addressLine2 ?? null,
        cityTown: location.cityTown,
        zipCode: location.zipCode ?? null,
        phoneNumber: location.phoneNumber,
        contactPhoneE164: contact.phoneNumber,
        issuingCountry:
          session.selectedRole === UserRole.RECIPIENT
            ? recipient!.issuingCountry
            : null,
        identificationNumber:
          session.selectedRole === UserRole.RECIPIENT
            ? recipient!.identificationNumber
            : null,
      });

      await profiles.save(profile);

      if (session.selectedRole === UserRole.COORDINATOR_SENDER) {
        await approvals.save(
          approvals.create({
            userId: savedUser.id,
            requestType: REGISTRATION_REQUEST_TYPE_COORDINATOR_SENDER,
            status: ApprovalRequestStatus.PENDING,
            rejectionReason: null,
            reviewedByUserId: null,
            reviewedAt: null,
          }),
        );
      }

      await registrationSessions.delete({ id: session.id });

      return savedUser.id;
    });

    return { userId, accountStatus };
  }

  private async requireOpenSession(id: string): Promise<RegistrationSession> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException('Registration session not found.');
    }

    if (!session.expiresAt || session.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Registration session has expired.');
    }

    return session;
  }
}
