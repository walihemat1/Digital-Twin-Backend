import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountStatus } from '../../../common/enums/account-status.enum';
import { VerificationStatus } from '../../../common/enums/verification-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RegistrationSession } from '../entities/registration-session.entity';
import { RegistrationService } from './registration.service';

describe('RegistrationService registration gating', () => {
  const sessions = new Map<string, RegistrationSession>();
  const sessionsRepo = {
    create: jest.fn((data: Partial<RegistrationSession>) => ({
      ...data,
      id: data.id ?? 'sess-1',
    })),
    save: jest.fn(async (s: RegistrationSession) => {
      sessions.set(s.id, { ...s });
      return s;
    }),
    findOne: jest.fn(async ({ where: { id } }: any) => sessions.get(id) ?? null),
    findOneOrFail: jest.fn(async ({ where: { id } }: any) => {
      const s = sessions.get(id);
      if (!s) throw new Error('not found');
      return s;
    }),
    exist: jest.fn(async () => false),
    delete: jest.fn(),
  };

  const usersRepo = { exist: jest.fn(async () => false), create: jest.fn(), save: jest.fn() };
  const profilesRepo = { create: jest.fn(), save: jest.fn() };
  const approvalsRepo = { create: jest.fn(), save: jest.fn() };

  const verificationService = {
    sendPhoneVerificationCode: jest.fn(async (s: RegistrationSession) => {
      s.phoneVerificationStatus = VerificationStatus.PENDING;
      s.phoneVerificationSentAt = new Date();
      s.phoneVerificationResendCount += 1;
      const now = new Date();
      return {
        sent: true,
        codeExpiresAt: new Date(
          now.getTime() + 600_000,
        ).toISOString(),
        resendCooldownSeconds: 60,
      };
    }),
    sendEmailCode: jest.fn(async (s: RegistrationSession) => {
      s.emailVerificationStatus = VerificationStatus.PENDING;
      s.emailVerificationSentAt = new Date();
    }),
    verifyPhoneCode: jest.fn(async () => ({ verified: true })),
    verifyEmailCode: jest.fn(async (s: RegistrationSession) => {
      s.emailVerificationStatus = VerificationStatus.VERIFIED;
      s.emailVerifiedAt = new Date();
      return { verifiedAt: new Date().toISOString() };
    }),
  };

  const dataSource = {
    transaction: jest.fn(async (cb: any) =>
      cb({
        getRepository: (repo: any) => {
          if (repo.name === 'User') return usersRepo;
          if (repo.name === 'UserProfile') return profilesRepo;
          if (repo.name === 'ApprovalRequest') return approvalsRepo;
          if (repo.name === 'RegistrationSession') return sessionsRepo;
          return null;
        },
      }),
    ),
  } as unknown as DataSource;

  const authConfig = { bcryptSaltRounds: 4 } as any;

  let service: RegistrationService;

  beforeEach(() => {
    sessions.clear();
    service = new RegistrationService(
      sessionsRepo as any,
      usersRepo as any,
      profilesRepo as any,
      dataSource,
      verificationService as any,
      authConfig,
    );
  });

  function makeSession(over: Partial<RegistrationSession>): RegistrationSession {
    const session: RegistrationSession = {
      id: over.id ?? 'sess-1',
      selectedRole: over.selectedRole ?? UserRole.COORDINATOR_SENDER,
      currentStep: over.currentStep ?? 'awaiting_contact',
      contactPayload: over.contactPayload ?? null,
      personalInfoPayload: over.personalInfoPayload ?? null,
      locationPayload: over.locationPayload ?? null,
      recipientDetailsPayload: over.recipientDetailsPayload ?? null,
      phoneVerificationStatus:
        over.phoneVerificationStatus ?? VerificationStatus.NOT_STARTED,
      phoneVerificationSentAt: over.phoneVerificationSentAt ?? null,
      phoneVerifiedAt: over.phoneVerifiedAt ?? null,
      phoneVerificationResendCount: over.phoneVerificationResendCount ?? 0,
      emailVerificationStatus:
        over.emailVerificationStatus ?? VerificationStatus.NOT_STARTED,
      emailVerificationSentAt: over.emailVerificationSentAt ?? null,
      emailVerifiedAt: over.emailVerifiedAt ?? null,
      verificationStatus: over.verificationStatus ?? VerificationStatus.UNVERIFIED,
      expiresAt: over.expiresAt ?? new Date(Date.now() + 60_000),
      createdAt: over.createdAt ?? new Date(),
      updatedAt: over.updatedAt ?? new Date(),
    };
    sessions.set(session.id, session);
    return session;
  }

  it('blocks personal info when phone not verified', async () => {
    const session = makeSession({
      currentStep: 'awaiting_personal_info',
      phoneVerificationStatus: VerificationStatus.PENDING,
    });
    await expect(
      service.savePersonalInfoStep(session.id, {
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.com',
        password: 'longpassword12',
        passwordConfirm: 'longpassword12',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks location when email not verified', async () => {
    const session = makeSession({
      currentStep: 'awaiting_location',
      phoneVerificationStatus: VerificationStatus.VERIFIED,
      emailVerificationStatus: VerificationStatus.PENDING,
      contactPayload: { phoneNumber: '+12025559876' } as any,
      personalInfoPayload: {
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.com',
        passwordHash: 'h',
        passwordPolicyVersion: 'v1',
      } as any,
    });
    await expect(
      service.saveLocationStep(session.id, {
        country: 'United States',
        countryCode: 'US',
        stateProvince: 'California',
        stateProvinceCode: 'CA',
        addressLine1: '123 Main Street',
        cityTown: 'Acalanes Ridge',
        zipCode: '90001',
        phoneNumber: '+12025559876',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects location when phone number does not match verified contact', async () => {
    const session = makeSession({
      currentStep: 'awaiting_location',
      phoneVerificationStatus: VerificationStatus.VERIFIED,
      emailVerificationStatus: VerificationStatus.VERIFIED,
      contactPayload: { phoneNumber: '+12025559876' } as any,
      personalInfoPayload: {
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.com',
        passwordHash: 'h',
        passwordPolicyVersion: 'v1',
      } as any,
    });
    await expect(
      service.saveLocationStep(session.id, {
        country: 'United States',
        countryCode: 'US',
        stateProvince: 'California',
        stateProvinceCode: 'CA',
        addressLine1: '123 Main Street',
        cityTown: 'Acalanes Ridge',
        zipCode: '90001',
        phoneNumber: '+12025559999',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks completion when verifications are incomplete', async () => {
    const session = makeSession({
      currentStep: 'ready_to_complete',
      contactPayload: { phoneNumber: '+12025559876' } as any,
      personalInfoPayload: {
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.com',
        passwordHash: 'h',
        passwordPolicyVersion: 'v1',
      } as any,
      locationPayload: {
        country: 'United States',
        countryCode: 'US',
        addressLine1: '123',
        cityTown: 'City',
        phoneNumber: '12345',
      } as any,
      phoneVerificationStatus: VerificationStatus.PENDING,
      emailVerificationStatus: VerificationStatus.PENDING,
    });
    await expect(
      service.completeRegistration(session.id),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resets phone verification when number changes', async () => {
    const session = makeSession({
      currentStep: 'awaiting_personal_info',
      contactPayload: {
        phoneNumber: '+12025559876',
      } as any,
      phoneVerificationStatus: VerificationStatus.VERIFIED,
      phoneVerifiedAt: new Date(),
      phoneVerificationResendCount: 0,
    });

    await service.saveContactStep(session.id, {
      phoneNumber: '+12025559877',
    });

    const updated = sessions.get(session.id)!;
    expect(updated.phoneVerificationStatus).toBe(VerificationStatus.NOT_STARTED);
    expect(updated.currentStep).toBe('awaiting_phone_verification');
    expect(verificationService.sendPhoneVerificationCode).not.toHaveBeenCalled();
  });
});
