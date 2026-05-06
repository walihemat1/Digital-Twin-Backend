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
    sendWhatsappCode: jest.fn(async (s: RegistrationSession) => {
      s.whatsappVerificationStatus = VerificationStatus.PENDING;
      s.whatsappVerificationSentAt = new Date();
    }),
    sendEmailCode: jest.fn(async (s: RegistrationSession) => {
      s.emailVerificationStatus = VerificationStatus.PENDING;
      s.emailVerificationSentAt = new Date();
    }),
    verifyWhatsappCode: jest.fn(async (s: RegistrationSession) => {
      s.whatsappVerificationStatus = VerificationStatus.VERIFIED;
      s.whatsappVerifiedAt = new Date();
      return { verifiedAt: new Date().toISOString() };
    }),
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
      whatsappVerificationStatus:
        over.whatsappVerificationStatus ?? VerificationStatus.NOT_STARTED,
      whatsappVerificationSentAt: over.whatsappVerificationSentAt ?? null,
      whatsappVerifiedAt: over.whatsappVerifiedAt ?? null,
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

  it('blocks personal info when WhatsApp not verified', async () => {
    const session = makeSession({
      currentStep: 'awaiting_personal_info',
      whatsappVerificationStatus: VerificationStatus.PENDING,
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
      whatsappVerificationStatus: VerificationStatus.VERIFIED,
      emailVerificationStatus: VerificationStatus.PENDING,
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
        country: 'US',
        addressLine1: '123',
        cityTown: 'City',
        phoneNumber: '12345',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks completion when verifications are incomplete', async () => {
    const session = makeSession({
      currentStep: 'ready_to_complete',
      contactPayload: { normalizedWhatsappNumber: '+123' } as any,
      personalInfoPayload: {
        firstName: 'A',
        lastName: 'B',
        email: 'a@example.com',
        passwordHash: 'h',
        passwordPolicyVersion: 'v1',
      } as any,
      locationPayload: {
        country: 'US',
        addressLine1: '123',
        cityTown: 'City',
        phoneNumber: '12345',
      } as any,
      whatsappVerificationStatus: VerificationStatus.PENDING,
      emailVerificationStatus: VerificationStatus.PENDING,
    });
    await expect(
      service.completeRegistration(session.id),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resets WhatsApp verification when number changes', async () => {
    const session = makeSession({
      currentStep: 'awaiting_personal_info',
      contactPayload: {
        whatsappCountryCode: '+1',
        whatsappNumber: '9999999',
        normalizedWhatsappNumber: '+19999999',
      } as any,
      whatsappVerificationStatus: VerificationStatus.VERIFIED,
      whatsappVerifiedAt: new Date(),
    });

    await service.saveContactStep(session.id, {
      whatsappCountryCode: '+1',
      whatsappNumber: '8888888',
    });

    const updated = sessions.get(session.id)!;
    expect(updated.whatsappVerificationStatus).toBe(VerificationStatus.PENDING);
    expect(updated.currentStep).toBe('awaiting_whatsapp_verification');
  });
});
