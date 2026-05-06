import { BadRequestException, GoneException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { NotificationChannel } from '../../../common/enums/notification-channel.enum';
import { VerificationStatus } from '../../../common/enums/verification-status.enum';
import { RegistrationSession } from '../entities/registration-session.entity';
import { RegistrationVerificationCode } from '../entities/registration-verification-code.entity';
import { RegistrationVerificationService } from './registration-verification.service';

describe('RegistrationVerificationService', () => {
  const authConfig = {
    bcryptSaltRounds: 4,
    regVerificationCodeTtlSeconds: 300,
    regVerificationMaxAttempts: 2,
    regVerificationMaxResends: 1,
    regVerificationResendCooldownSeconds: 0,
  } as any;

  let sentWhatsappCode = '';
  let sentEmailCode = '';
  let codes: RegistrationVerificationCode[] = [];
  const sessions = new Map<string, RegistrationSession>();

  const sessionTemplate = (): RegistrationSession =>
    ({
      id: 'sess-1',
      selectedRole: null,
      currentStep: 'awaiting_contact',
      contactPayload: {
        normalizedWhatsappNumber: '+1234567890',
      },
      personalInfoPayload: { email: 'a@example.com', firstName: 'A' },
      locationPayload: null,
      recipientDetailsPayload: null,
      whatsappVerificationStatus: VerificationStatus.NOT_STARTED,
      whatsappVerificationSentAt: null,
      whatsappVerifiedAt: null,
      emailVerificationStatus: VerificationStatus.NOT_STARTED,
      emailVerificationSentAt: null,
      emailVerifiedAt: null,
      verificationStatus: VerificationStatus.UNVERIFIED,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
    }) as unknown as RegistrationSession;

  const codesRepo = {
    create: jest.fn((d: Partial<RegistrationVerificationCode>) => ({
      id: `code-${codes.length + 1}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...d,
    })),
    save: jest.fn(async (c: RegistrationVerificationCode) => {
      codes.push(c);
      return c;
    }),
    findOne: jest.fn(async (opts: any) => {
      const where = opts.where;
      const filtered = codes.filter((c) => {
        return (
          c.registrationSessionId === where.registrationSessionId &&
          c.channel === where.channel &&
          (where.invalidatedAt === null ? c.invalidatedAt === null : true) &&
          (where.verifiedAt === null ? c.verifiedAt === null : true)
        );
      });
      filtered.sort(
        (a, b) => b.issuedAt.getTime() - a.issuedAt.getTime(),
      );
      return filtered[0] ?? null;
    }),
    update: jest.fn(async (criteria: any, partial: Partial<RegistrationVerificationCode>) => {
      const id = criteria.id;
      const idx = codes.findIndex((c) => c.id === id);
      if (idx >= 0) {
        codes[idx] = { ...codes[idx], ...partial };
      }
    }),
  };

  const sessionsRepo = {
    save: jest.fn(async (s: RegistrationSession) => {
      sessions.set(s.id, { ...s });
      return s;
    }),
  };

  const whatsapp = {
    sendVerificationCode: jest.fn(async (_to: string, code: string) => {
      sentWhatsappCode = code;
    }),
  };
  const email = {
    sendLoginMfaCode: jest.fn(async (_to: string, _name: string, code: string) => {
      sentEmailCode = code;
    }),
  };

  let service: RegistrationVerificationService;

  beforeEach(() => {
    codes = [];
    sentWhatsappCode = '';
    sentEmailCode = '';
    sessions.clear();
    service = new RegistrationVerificationService(
      codesRepo as any,
      sessionsRepo as any,
      email as any,
      whatsapp as any,
      authConfig,
    );
  });

  function makeSession(over: Partial<RegistrationSession> = {}) {
    const s = { ...sessionTemplate(), ...over };
    sessions.set(s.id, s);
    return s;
  }

  it('sends and verifies WhatsApp code successfully', async () => {
    const session = makeSession();
    await service.sendWhatsappCode(session);
    expect(sentWhatsappCode).toHaveLength(6);
    expect(session.whatsappVerificationStatus).toBe(VerificationStatus.PENDING);

    const verified = await service.verifyWhatsappCode(session, sentWhatsappCode);
    expect(verified.verifiedAt).toBeDefined();
    expect(session.whatsappVerificationStatus).toBe(VerificationStatus.VERIFIED);
  });

  it('fails WhatsApp verification on wrong code and increments attempts', async () => {
    const session = makeSession();
    await service.sendWhatsappCode(session);
    await expect(
      service.verifyWhatsappCode(session, '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const latest = codes[codes.length - 1];
    expect(latest.attemptCount).toBe(1);
  });

  it('marks WhatsApp verification expired when code is stale', async () => {
    const session = makeSession();
    await service.sendWhatsappCode(session);
    codes[codes.length - 1].expiresAt = new Date(Date.now() - 1000);
    await expect(
      service.verifyWhatsappCode(session, sentWhatsappCode),
    ).rejects.toBeInstanceOf(GoneException);
    expect(session.whatsappVerificationStatus).toBe(VerificationStatus.EXPIRED);
  });

  it('resends WhatsApp code and invalidates previous', async () => {
    const session = makeSession();
    await service.sendWhatsappCode(session);
    const firstId = codes[codes.length - 1].id;
    await service.resendWhatsappCode(session);
    expect(codes.length).toBe(2);
    const first = codes.find((c) => c.id === firstId)!;
    expect(first.invalidatedAt).not.toBeNull();
    expect(codes[codes.length - 1].resendCount).toBe(1);
  });

  it('sends and verifies email code successfully', async () => {
    const session = makeSession({
      personalInfoPayload: { email: 'a@example.com', firstName: 'A' },
    });
    await service.sendEmailCode(session);
    expect(sentEmailCode).toHaveLength(6);
    await service.verifyEmailCode(session, sentEmailCode);
    expect(session.emailVerificationStatus).toBe(VerificationStatus.VERIFIED);
  });

  it('blocks verification after attempts exceeded', async () => {
    const session = makeSession();
    await service.sendWhatsappCode(session);
    await expect(
      service.verifyWhatsappCode(session, '111111'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.verifyWhatsappCode(session, '222222'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(session.whatsappVerificationStatus).toBe(VerificationStatus.FAILED);
  });
});
