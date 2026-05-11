import {
  BadRequestException,
  GoneException,
  UnauthorizedException,
} from '@nestjs/common';
import { VerificationStatus } from '../../../common/enums/verification-status.enum';
import { RegistrationSession } from '../entities/registration-session.entity';
import { RegistrationVerificationCode } from '../entities/registration-verification-code.entity';
import { RegistrationVerificationService } from './registration-verification.service';

describe('RegistrationVerificationService', () => {
  const authConfig = {
    bcryptSaltRounds: 4,
    regVerificationCodeTtlSeconds: 300,
    regVerificationMaxAttempts: 2,
    regVerificationMaxResends: 3,
    regVerificationResendCooldownSeconds: 0,
  } as any;

  let sentEmailCode = '';
  let codes: RegistrationVerificationCode[] = [];
  const sessions = new Map<string, RegistrationSession>();

  const sessionTemplate = (): RegistrationSession =>
    ({
      id: 'sess-1',
      selectedRole: null,
      currentStep: 'awaiting_contact',
      contactPayload: {
        phoneNumber: '+12345678901',
      },
      personalInfoPayload: { email: 'a@example.com', firstName: 'A' },
      locationPayload: null,
      recipientDetailsPayload: null,
      phoneVerificationStatus: VerificationStatus.NOT_STARTED,
      phoneVerificationSentAt: null,
      phoneVerifiedAt: null,
      phoneVerificationResendCount: 0,
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

  const twilioVerify = {
    sendSmsVerification: jest.fn(async () => {}),
    checkVerification: jest.fn(async () => ({ status: 'approved' })),
  };

  const email = {
    sendLoginMfaCode: jest.fn(async (_to: string, _name: string, code: string) => {
      sentEmailCode = code;
    }),
  };

  let service: RegistrationVerificationService;

  beforeEach(() => {
    codes = [];
    sentEmailCode = '';
    sessions.clear();
    twilioVerify.sendSmsVerification.mockClear();
    twilioVerify.checkVerification.mockResolvedValue({ status: 'approved' });
    service = new RegistrationVerificationService(
      codesRepo as any,
      sessionsRepo as any,
      email as any,
      twilioVerify as any,
      authConfig,
    );
  });

  function makeSession(over: Partial<RegistrationSession> = {}) {
    const s = { ...sessionTemplate(), ...over };
    sessions.set(s.id, s);
    return s;
  }

  it('sends phone verification via Twilio Verify and marks pending', async () => {
    const session = makeSession();
    const out = await service.sendPhoneVerificationCode(session, '+12345678901');
    expect(twilioVerify.sendSmsVerification).toHaveBeenCalledWith('+12345678901');
    expect(session.phoneVerificationStatus).toBe(VerificationStatus.PENDING);
    expect(session.phoneVerificationResendCount).toBe(1);
    expect(out.sent).toBe(true);
    expect(out.codeExpiresAt).toBeTruthy();
    expect(out.resendCooldownSeconds).toBe(authConfig.regVerificationResendCooldownSeconds);
  });

  it('verifies phone when Twilio returns approved', async () => {
    const session = makeSession({
      phoneVerificationStatus: VerificationStatus.PENDING,
      phoneVerificationResendCount: 1,
    });
    const out = await service.verifyPhoneCode(session, '+12345678901', '123456');
    expect(out.verified).toBe(true);
    expect(session.phoneVerificationStatus).toBe(VerificationStatus.VERIFIED);
    expect(twilioVerify.checkVerification).toHaveBeenCalledWith(
      '+12345678901',
      '123456',
    );
  });

  it('returns verified false when Twilio status is not approved', async () => {
    twilioVerify.checkVerification.mockResolvedValueOnce({ status: 'pending' });
    const session = makeSession({
      phoneVerificationStatus: VerificationStatus.PENDING,
      phoneVerificationResendCount: 1,
    });
    const out = await service.verifyPhoneCode(session, '+12345678901', '000000');
    expect(out.verified).toBe(false);
    expect(out.message).toBeDefined();
    expect(session.phoneVerificationStatus).toBe(VerificationStatus.PENDING);
  });

  it('rejects mismatched phone numbers on send', async () => {
    const session = makeSession();
    await expect(
      service.sendPhoneVerificationCode(session, '+19998887777'),
    ).rejects.toBeInstanceOf(BadRequestException);
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

  it('fails email verification on wrong code and increments attempts', async () => {
    const session = makeSession({
      personalInfoPayload: { email: 'a@example.com', firstName: 'A' },
    });
    await service.sendEmailCode(session);
    await expect(
      service.verifyEmailCode(session, '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const latest = codes[codes.length - 1];
    expect(latest.attemptCount).toBe(1);
  });

  it('marks email verification expired when code is stale', async () => {
    const session = makeSession({
      personalInfoPayload: { email: 'a@example.com', firstName: 'A' },
    });
    await service.sendEmailCode(session);
    codes[codes.length - 1].expiresAt = new Date(Date.now() - 1000);
    await expect(
      service.verifyEmailCode(session, sentEmailCode),
    ).rejects.toBeInstanceOf(GoneException);
    expect(session.emailVerificationStatus).toBe(VerificationStatus.EXPIRED);
  });

  it('blocks email verification after attempts exceeded', async () => {
    const session = makeSession({
      personalInfoPayload: { email: 'a@example.com', firstName: 'A' },
    });
    await service.sendEmailCode(session);
    await expect(
      service.verifyEmailCode(session, '111111'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.verifyEmailCode(session, '222222'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(session.emailVerificationStatus).toBe(VerificationStatus.FAILED);
  });
});
