import {
  BadRequestException,
  ConflictException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { AccountStatus } from '../../../common/enums/account-status.enum';
import { ApprovalRequestStatus } from '../../../common/enums/approval-request-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { normalizeEmail } from '../../../common/utils/normalization.util';
import authConfig from '../../../config/auth.config';
import { ApprovalRequest } from '../../approval/entities/approval-request.entity';
import { User } from '../../users/entities/user.entity';
import { UserProfile } from '../../users/entities/user-profile.entity';
import { RegistrationContactStepDto } from '../dto/registration-contact-step.dto';
import { RegistrationLocationStepDto } from '../dto/registration-location-step.dto';
import { RegistrationPersonalInfoStepDto } from '../dto/registration-personal-info-step.dto';
import { SelectRoleDto } from '../dto/select-role.dto';
import { RegistrationSession } from '../entities/registration-session.entity';
import {
  PASSWORD_POLICY_VERSION,
  REGISTRATION_REQUEST_TYPE_COORDINATOR_SENDER,
  REGISTRATION_SELECTABLE_ROLES,
  REGISTRATION_SESSION_TTL_MS,
  RegistrationStep,
} from './registration.constants';
import {
  isPasswordPolicyCompliant,
  passwordPolicyFailureMessage,
} from './password-policy';
import { buildNormalizedWhatsappNumber } from './whatsapp.util';

type ContactPayloadV1 = {
  whatsappCountryCode: string;
  whatsappNumber: string;
  normalizedWhatsappNumber: string;
};

type PersonalInfoPayloadV1 = {
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  passwordPolicyVersion: string;
};

type LocationPayloadV1 = {
  country: string;
  stateProvince?: string;
  addressLine1: string;
  addressLine2?: string;
  cityTown: string;
  zipCode?: string;
  phoneNumber: string;
};

@Injectable()
export class RegistrationService {
  constructor(
    @InjectRepository(RegistrationSession)
    private readonly sessions: Repository<RegistrationSession>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly dataSource: DataSource,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  async createSession(): Promise<RegistrationSession> {
    const now = new Date();
    const session = this.sessions.create({
      selectedRole: null,
      currentStep: RegistrationStep.AWAITING_ROLE,
      contactPayload: null,
      personalInfoPayload: null,
      locationPayload: null,
      recipientDetailsPayload: null,
      expiresAt: new Date(now.getTime() + REGISTRATION_SESSION_TTL_MS),
    });
    return this.sessions.save(session);
  }

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

    if (roleChanged) {
      session.contactPayload = null;
      session.personalInfoPayload = null;
      session.locationPayload = null;
      session.recipientDetailsPayload = null;
    }

    return this.sessions.save(session);
  }

  async saveContactStep(
    id: string,
    dto: RegistrationContactStepDto,
  ): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(id);

    if (session.currentStep !== RegistrationStep.AWAITING_CONTACT) {
      throw new BadRequestException('Contact step is not available yet.');
    }

    if (!session.selectedRole) {
      throw new BadRequestException('Role must be selected first.');
    }

    const normalized = buildNormalizedWhatsappNumber(
      dto.whatsappCountryCode,
      dto.whatsappNumber,
    );

    const payload: ContactPayloadV1 = {
      whatsappCountryCode: dto.whatsappCountryCode.trim(),
      whatsappNumber: dto.whatsappNumber.trim(),
      normalizedWhatsappNumber: normalized,
    };

    session.contactPayload = payload as unknown as Record<string, unknown>;
    session.currentStep = RegistrationStep.AWAITING_PERSONAL_INFO;

    return this.sessions.save(session);
  }

  async savePersonalInfoStep(
    id: string,
    dto: RegistrationPersonalInfoStepDto,
  ): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(id);

    if (session.currentStep !== RegistrationStep.AWAITING_PERSONAL_INFO) {
      throw new BadRequestException('Personal info step is not available yet.');
    }

    if (dto.password !== dto.passwordConfirm) {
      throw new BadRequestException('Passwords do not match.');
    }

    if (!isPasswordPolicyCompliant(dto.password)) {
      throw new BadRequestException(passwordPolicyFailureMessage());
    }

    const email = normalizeEmail(dto.email);
    const existing = await this.users.exist({ where: { email } });
    if (existing) {
      throw new ConflictException('Email is already registered.');
    }

    const passwordHash = await bcrypt.hash(
      dto.password,
      this.auth.bcryptSaltRounds,
    );

    const payload: PersonalInfoPayloadV1 = {
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      passwordHash,
      passwordPolicyVersion: PASSWORD_POLICY_VERSION,
    };

    session.personalInfoPayload = payload as unknown as Record<string, unknown>;
    session.currentStep = RegistrationStep.AWAITING_LOCATION;

    return this.sessions.save(session);
  }

  async saveLocationStep(
    id: string,
    dto: RegistrationLocationStepDto,
  ): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(id);

    if (session.currentStep !== RegistrationStep.AWAITING_LOCATION) {
      throw new BadRequestException('Location step is not available yet.');
    }

    const payload: LocationPayloadV1 = {
      country: dto.country.trim(),
      stateProvince: dto.stateProvince?.trim(),
      addressLine1: dto.addressLine1.trim(),
      addressLine2: dto.addressLine2?.trim(),
      cityTown: dto.cityTown.trim(),
      zipCode: dto.zipCode?.trim(),
      phoneNumber: dto.phoneNumber.trim(),
    };

    session.locationPayload = payload as unknown as Record<string, unknown>;
    session.currentStep = RegistrationStep.READY_TO_COMPLETE;

    return this.sessions.save(session);
  }

  async completeRegistration(id: string): Promise<{ userId: string }> {
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

    if (!session.selectedRole || !contact || !personal || !location) {
      throw new BadRequestException('Registration data is incomplete.');
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
      const existing = await this.users.exist({ where: { email } });
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
        organizationName: null,
        country: location.country,
        stateProvince: location.stateProvince ?? null,
        addressLine1: location.addressLine1,
        addressLine2: location.addressLine2 ?? null,
        cityTown: location.cityTown,
        zipCode: location.zipCode ?? null,
        phoneNumber: location.phoneNumber,
        whatsappCountryCode: contact.whatsappCountryCode,
        whatsappNumber: contact.whatsappNumber,
        normalizedWhatsappNumber: contact.normalizedWhatsappNumber,
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

    return { userId };
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
