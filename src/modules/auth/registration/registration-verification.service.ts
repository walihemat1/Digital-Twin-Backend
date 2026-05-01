import {
  BadRequestException,
  GoneException,
  Inject,
  Injectable,
  Logger,
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
import { TwilioWhatsappService } from './twilio-whatsapp.service';

type Channel = NotificationChannel.EMAIL | NotificationChannel.WHATSAPP;

@Injectable()
export class RegistrationVerificationService {
  private readonly log = new Logger(RegistrationVerificationService.name);

  constructor(
    @InjectRepository(RegistrationVerificationCode)
    private readonly codes: Repository<RegistrationVerificationCode>,
    @InjectRepository(RegistrationSession)
    private readonly sessions: Repository<RegistrationSession>,
    private readonly email: SendgridEmailService,
    private readonly whatsapp: TwilioWhatsappService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  async sendWhatsappCode(session: RegistrationSession): Promise<{
    expiresAt: string;
    resendCount: number;
  }> {
    const number =
      (session.contactPayload as { normalizedWhatsappNumber?: string } | null)
        ?.normalizedWhatsappNumber;
    if (!number) {
      throw new BadRequestException(
        'WhatsApp number is missing from the registration contact step.',
      );
    }
    return this.issueCode(session, NotificationChannel.WHATSAPP, (code) =>
      this.whatsapp.sendVerificationCode(number, code),
    );
  }

  async resendWhatsappCode(session: RegistrationSession) {
    return this.sendWhatsappCode(session);
  }

  async verifyWhatsappCode(
    session: RegistrationSession,
    code: string,
  ): Promise<{ verifiedAt: string }> {
    return this.verifyCode(
      session,
      NotificationChannel.WHATSAPP,
      code,
      (s, now) => {
        s.whatsappVerificationStatus = VerificationStatus.VERIFIED;
        s.whatsappVerifiedAt = now;
      },
      (s) => {
        s.whatsappVerificationStatus = VerificationStatus.EXPIRED;
      },
      (s) => {
        s.whatsappVerificationStatus = VerificationStatus.FAILED;
      },
    );
  }

  async sendEmailCode(session: RegistrationSession): Promise<{
    expiresAt: string;
    resendCount: number;
  }> {
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

  async resendEmailCode(session: RegistrationSession) {
    return this.sendEmailCode(session);
  }

  async verifyEmailCode(
    session: RegistrationSession,
    code: string,
  ): Promise<{ verifiedAt: string }> {
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
    channel: Channel,
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

    if (channel === NotificationChannel.WHATSAPP) {
      session.whatsappVerificationStatus = VerificationStatus.PENDING;
      session.whatsappVerificationSentAt = now;
      session.whatsappVerifiedAt = null;
    } else {
      session.emailVerificationStatus = VerificationStatus.PENDING;
      session.emailVerificationSentAt = now;
      session.emailVerifiedAt = null;
    }
    await this.sessions.save(session);

    return {
      expiresAt: expiresAt.toISOString(),
      resendCount: record.resendCount,
    };
  }

  private async verifyCode(
    session: RegistrationSession,
    channel: Channel,
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
