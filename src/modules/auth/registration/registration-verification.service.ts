import {
  BadRequestException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { IsNull, Repository } from 'typeorm';
import { NotificationChannel } from '../../../common/enums/notification-channel.enum';
import { VerificationStatus } from '../../../common/enums/verification-status.enum';
import authConfig from '../../../config/auth.config';
import { SendgridEmailService } from '../email/sendgrid-email.service';
import { RegistrationSession } from '../entities/registration-session.entity';
import { RegistrationVerificationCode } from '../entities/registration-verification-code.entity';
import { generateSixDigitMfaCode } from '../crypto/opaque-token.util';
import { normalizePhoneToE164 } from './phone-number.util';
import { TwilioVerifyService } from './twilio-verify.service';

type EmailChannel = NotificationChannel.EMAIL;

@Injectable()
export class RegistrationVerificationService {
  constructor(
    @InjectRepository(RegistrationVerificationCode)
    private readonly codes: Repository<RegistrationVerificationCode>,
    @InjectRepository(RegistrationSession)
    private readonly sessions: Repository<RegistrationSession>,
    private readonly email: SendgridEmailService,
    private readonly twilioVerify: TwilioVerifyService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  private async resolveSession(
    sessionOrId: RegistrationSession | string,
  ): Promise<RegistrationSession> {
    if (typeof sessionOrId !== 'string') {
      return sessionOrId;
    }
    const session = await this.sessions.findOne({ where: { id: sessionOrId } });
    if (!session) {
      throw new NotFoundException('Registration session not found.');
    }
    return session;
  }

  private getContactPhoneE164(session: RegistrationSession): string | null {
    const payload = session.contactPayload as { phoneNumber?: string } | null;
    const raw =
      (typeof payload?.phoneNumber === 'string' && payload.phoneNumber) || null;
    if (!raw) {
      return null;
    }
    try {
      return normalizePhoneToE164(raw);
    } catch {
      return null;
    }
  }

  /**
   * Sends an SMS OTP via Twilio Verify (no local OTP storage).
   */
  async sendPhoneVerificationCode(
    sessionOrId: RegistrationSession | string,
    phoneNumberFromClient?: string,
  ): Promise<{
    sent: boolean;
    codeExpiresAt: string;
    resendCooldownSeconds: number;
  }> {
    const session = await this.resolveSession(sessionOrId);
    await this.ensureSessionActive(session);

    const stored = this.getContactPhoneE164(session);
    if (!stored) {
      throw new BadRequestException(
        'Phone number is missing from the registration contact step.',
      );
    }

    const target = phoneNumberFromClient
      ? normalizePhoneToE164(phoneNumberFromClient)
      : stored;

    if (target !== stored) {
      throw new BadRequestException(
        'Phone number does not match the saved contact number.',
      );
    }

    if (session.phoneVerificationStatus === VerificationStatus.VERIFIED) {
      const verifiedNow = new Date();
      const codeExpiresAt = new Date(
        verifiedNow.getTime() +
          this.auth.regVerificationCodeTtlSeconds * 1000,
      );
      return {
        sent: true,
        codeExpiresAt: codeExpiresAt.toISOString(),
        resendCooldownSeconds: this.auth.regVerificationResendCooldownSeconds,
      };
    }

    const now = new Date();
    if (session.phoneVerificationSentAt) {
      const elapsed =
        now.getTime() - session.phoneVerificationSentAt.getTime();
      const cooldownMs = this.auth.regVerificationResendCooldownSeconds * 1000;
      if (elapsed < cooldownMs) {
        throw new BadRequestException(
          'Please wait before requesting another verification code.',
        );
      }
    }

    if (
      session.phoneVerificationResendCount >=
      this.auth.regVerificationMaxResends
    ) {
      throw new BadRequestException(
        'Resend limit reached for this verification.',
      );
    }

    await this.twilioVerify.sendSmsVerification(target);

    session.phoneVerificationStatus = VerificationStatus.PENDING;
    session.phoneVerificationSentAt = now;
    session.phoneVerifiedAt = null;
    session.phoneVerificationResendCount += 1;
    await this.sessions.save(session);

    const codeExpiresAt = new Date(
      now.getTime() + this.auth.regVerificationCodeTtlSeconds * 1000,
    );
    return {
      sent: true,
      codeExpiresAt: codeExpiresAt.toISOString(),
      resendCooldownSeconds: this.auth.regVerificationResendCooldownSeconds,
    };
  }

  async resendPhoneVerificationCode(
    sessionOrId: RegistrationSession | string,
    phoneNumberFromClient?: string,
  ): Promise<{
    sent: boolean;
    codeExpiresAt: string;
    resendCooldownSeconds: number;
  }> {
    return this.sendPhoneVerificationCode(sessionOrId, phoneNumberFromClient);
  }

  async verifyPhoneCode(
    sessionOrId: RegistrationSession | string,
    phoneNumberFromClient: string,
    code: string,
  ): Promise<{ verified: boolean; message?: string }> {
    const session = await this.resolveSession(sessionOrId);
    await this.ensureSessionActive(session);

    const stored = this.getContactPhoneE164(session);
    if (!stored) {
      throw new BadRequestException(
        'Phone number is missing from the registration contact step.',
      );
    }

    const target = normalizePhoneToE164(phoneNumberFromClient);
    if (target !== stored) {
      throw new BadRequestException(
        'Phone number does not match the saved contact number.',
      );
    }

    const { status } = await this.twilioVerify.checkVerification(
      target,
      code.trim(),
    );

    if (status === 'approved') {
      const now = new Date();
      session.phoneVerificationStatus = VerificationStatus.VERIFIED;
      session.phoneVerifiedAt = now;
      await this.sessions.save(session);
      return { verified: true };
    }

    const message =
      status === 'failed'
        ? 'Unable to verify the code right now. Try again shortly.'
        : 'Invalid or expired verification code.';
    return { verified: false, message };
  }

  async sendEmailCode(sessionOrId: RegistrationSession | string): Promise<{
    expiresAt: string;
    resendCount: number;
  }> {
    const session = await this.resolveSession(sessionOrId);
    const personal =
      session.personalInfoPayload as { email?: string; firstName?: string } | null;
    if (!personal?.email || !personal.firstName) {
      throw new BadRequestException(
        'Email and first name are required before sending verification.',
      );
    }
    return this.issueCode(session, NotificationChannel.EMAIL, (code) =>
      this.email.sendLoginMfaCode(personal.email!, personal.firstName!, code),
    );
  }

  async resendEmailCode(sessionOrId: RegistrationSession | string) {
    return this.sendEmailCode(sessionOrId);
  }

  async verifyEmailCode(
    sessionOrId: RegistrationSession | string,
    code: string,
  ): Promise<{ verifiedAt: string }> {
    const session = await this.resolveSession(sessionOrId);
    return this.verifyCode(
      session,
      NotificationChannel.EMAIL,
      code,
      (s, now) => {
        s.emailVerificationStatus = VerificationStatus.VERIFIED;
        s.emailVerifiedAt = now;
      },
      (s) => {
        s.emailVerificationStatus = VerificationStatus.EXPIRED;
      },
      (s) => {
        s.emailVerificationStatus = VerificationStatus.FAILED;
      },
    );
  }

  private async issueCode(
    session: RegistrationSession,
    channel: EmailChannel,
    send: (code: string) => Promise<void>,
  ): Promise<{ expiresAt: string; resendCount: number }> {
    await this.ensureSessionActive(session);
    const now = new Date();
    const latest = await this.codes.findOne({
      where: {
        registrationSessionId: session.id,
        channel,
        invalidatedAt: IsNull(),
      },
      order: { issuedAt: 'DESC' },
    });

    if (latest) {
      const cooldownMs = this.auth.regVerificationResendCooldownSeconds * 1000;
      if (now.getTime() - latest.issuedAt.getTime() < cooldownMs) {
        throw new BadRequestException(
          'Please wait before requesting another verification code.',
        );
      }
      if (latest.resendCount >= this.auth.regVerificationMaxResends) {
        throw new BadRequestException(
          'Resend limit reached for this verification.',
        );
      }
      await this.codes.update(
        { id: latest.id },
        { invalidatedAt: now, resendCount: latest.resendCount },
      );
    }

    const plain = generateSixDigitMfaCode();
    const codeHash = await bcrypt.hash(plain, this.auth.bcryptSaltRounds);
    const expiresAt = new Date(
      now.getTime() + this.auth.regVerificationCodeTtlSeconds * 1000,
    );
    const record = this.codes.create({
      registrationSessionId: session.id,
      channel,
      codeHash,
      issuedAt: now,
      expiresAt,
      verifiedAt: null,
      invalidatedAt: null,
      attemptCount: 0,
      resendCount: latest ? latest.resendCount + 1 : 0,
    });
    await this.codes.save(record);

    await send(plain);

    session.emailVerificationStatus = VerificationStatus.PENDING;
    session.emailVerificationSentAt = now;
    session.emailVerifiedAt = null;
    await this.sessions.save(session);

    return {
      expiresAt: expiresAt.toISOString(),
      resendCount: record.resendCount,
    };
  }

  private async verifyCode(
    session: RegistrationSession,
    channel: EmailChannel,
    code: string,
    onSuccess: (session: RegistrationSession, now: Date) => void,
    onExpired: (session: RegistrationSession) => void,
    onAttemptsExceeded: (session: RegistrationSession) => void,
  ): Promise<{ verifiedAt: string }> {
    await this.ensureSessionActive(session);
    const latest = await this.codes.findOne({
      where: {
        registrationSessionId: session.id,
        channel,
        invalidatedAt: IsNull(),
        verifiedAt: IsNull(),
      },
      order: { issuedAt: 'DESC' },
    });
    if (!latest) {
      throw new NotFoundException('No active verification request found.');
    }

    const now = new Date();
    if (latest.expiresAt.getTime() <= now.getTime()) {
      await this.codes.update({ id: latest.id }, { invalidatedAt: now });
      onExpired(session);
      await this.sessions.save(session);
      throw new GoneException(
        'The verification code has expired. Request a new one.',
      );
    }
    if (latest.attemptCount >= this.auth.regVerificationMaxAttempts) {
      await this.codes.update({ id: latest.id }, { invalidatedAt: now });
      onAttemptsExceeded(session);
      await this.sessions.save(session);
      throw new BadRequestException(
        'Too many attempts. Request a new verification code.',
      );
    }

    const match = await bcrypt.compare(code, latest.codeHash);
    if (!match) {
      const nextAttempts = latest.attemptCount + 1;
      const invalidatedAt =
        nextAttempts >= this.auth.regVerificationMaxAttempts ? now : null;
      await this.codes.update(
        { id: latest.id },
        { attemptCount: nextAttempts, invalidatedAt },
      );
      if (invalidatedAt) {
        onAttemptsExceeded(session);
        await this.sessions.save(session);
        throw new BadRequestException(
          'Too many attempts. Request a new verification code.',
        );
      }
      throw new UnauthorizedException('The verification code is incorrect.');
    }

    await this.codes.update(
      { id: latest.id },
      { verifiedAt: now, attemptCount: latest.attemptCount },
    );
    onSuccess(session, now);
    await this.sessions.save(session);
    return { verifiedAt: now.toISOString() };
  }

  private async ensureSessionActive(session: RegistrationSession) {
    if (!session.expiresAt || session.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Registration session has expired.');
    }
  }
}
