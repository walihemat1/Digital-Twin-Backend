import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import {
  DataSource,
  EntityManager,
  IsNull,
  QueryDeepPartialEntity,
  Repository,
} from 'typeorm';
import { NotificationChannel } from '../../../common/enums/notification-channel.enum';
import { VerificationStatus } from '../../../common/enums/verification-status.enum';
import authConfig from '../../../config/auth.config';
import { generateSixDigitMfaCode } from '../crypto/opaque-token.util';
import { RegistrationSession } from '../entities/registration-session.entity';
import { RegistrationVerification } from '../entities/registration-verification.entity';
import { SendgridEmailService } from '../email/sendgrid-email.service';
import { RegistrationStep } from './registration.constants';
import { TwilioWhatsappService } from './twilio-whatsapp.service';

type ContactPayload = {
  whatsappCountryCode: string;
  whatsappNumber: string;
  normalizedWhatsappNumber: string;
};

type PersonalInfoPayload = {
  firstName: string;
  lastName: string;
  email: string;
};

@Injectable()
export class RegistrationVerificationService {
  constructor(
    @InjectRepository(RegistrationSession)
    private readonly sessions: Repository<RegistrationSession>,
    @InjectRepository(RegistrationVerification)
    private readonly verifications: Repository<RegistrationVerification>,
    private readonly twilio: TwilioWhatsappService,
    private readonly email: SendgridEmailService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
    private readonly dataSource: DataSource,
  ) {}

  async sendWhatsappCode(sessionId: string): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(sessionId);
    const contact = this.requireContactPayload(session);
    this.ensureStep(
      session,
      RegistrationStep.AWAITING_WHATSAPP_VERIFICATION,
      'WhatsApp verification is not available for this session.',
    );
    const active = await this.getActiveVerification(
      session.id,
      NotificationChannel.WHATSAPP,
    );
    this.ensureResendAllowed(active);
    const resendCount = active ? active.resendCount + 1 : 0;

    const { plainCode } = await this.issueVerification(
      session.id,
      NotificationChannel.WHATSAPP,
      resendCount,
      {
        currentStep: RegistrationStep.AWAITING_WHATSAPP_VERIFICATION,
        verificationStatus: VerificationStatus.PENDING,
        whatsappVerificationStatus: VerificationStatus.PENDING,
      },
    );

    await this.twilio.sendVerificationCode(
      contact.normalizedWhatsappNumber,
      plainCode,
    );
    return this.requireSession(session.id);
  }

  async resendWhatsappCode(sessionId: string): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(sessionId);
    const contact = this.requireContactPayload(session);
    this.ensureStep(
      session,
      RegistrationStep.AWAITING_WHATSAPP_VERIFICATION,
      'WhatsApp verification is not available for this session.',
    );
    const active = await this.getActiveVerification(
      session.id,
      NotificationChannel.WHATSAPP,
    );
    if (!active) {
      throw new BadRequestException('No pending WhatsApp verification to resend.');
    }
    this.ensureResendAllowed(active);

    const { plainCode } = await this.issueVerification(
      session.id,
      NotificationChannel.WHATSAPP,
      active.resendCount + 1,
      {
        currentStep: RegistrationStep.AWAITING_WHATSAPP_VERIFICATION,
        verificationStatus: VerificationStatus.PENDING,
        whatsappVerificationStatus: VerificationStatus.PENDING,
      },
    );

    await this.twilio.sendVerificationCode(
      contact.normalizedWhatsappNumber,
      plainCode,
    );
    return this.requireSession(session.id);
  }

  async verifyWhatsappCode(
    sessionId: string,
    code: string,
  ): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(sessionId);
    this.ensureStep(
      session,
      RegistrationStep.AWAITING_WHATSAPP_VERIFICATION,
      'WhatsApp verification is not active for this session.',
    );
    const verification = await this.getActiveVerification(
      session.id,
      NotificationChannel.WHATSAPP,
    );
    if (!verification) {
      throw new UnauthorizedException('No WhatsApp verification is pending.');
    }

    await this.ensureVerificationIsUsable(sessionId, verification);
    const match = await bcrypt.compare(code, verification.codeHash);
    if (!match) {
      await this.handleIncorrectCode(sessionId, verification);
      throw new UnauthorizedException('The verification code is incorrect.');
    }

    await this.dataSource.transaction(async (em) => {
      await em.getRepository(RegistrationVerification).update(verification.id, {
        verifiedAt: new Date(),
      });

      await em.getRepository(RegistrationSession).update(session.id, {
        whatsappVerificationStatus: VerificationStatus.VERIFIED,
        verificationStatus:
          session.emailVerificationStatus === VerificationStatus.VERIFIED
            ? VerificationStatus.VERIFIED
            : VerificationStatus.PENDING,
        currentStep: RegistrationStep.AWAITING_PERSONAL_INFO,
      });
    });

    return this.requireSession(session.id);
  }

  async sendEmailCode(sessionId: string): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(sessionId);
    const personalInfo = this.requirePersonalInfoPayload(session);
    this.ensureStep(
      session,
      RegistrationStep.AWAITING_EMAIL_VERIFICATION,
      'Email verification is not available for this session.',
    );
    const active = await this.getActiveVerification(
      session.id,
      NotificationChannel.EMAIL,
    );
    this.ensureResendAllowed(active);
    const resendCount = active ? active.resendCount + 1 : 0;

    const { plainCode } = await this.issueVerification(
      session.id,
      NotificationChannel.EMAIL,
      resendCount,
      {
        currentStep: RegistrationStep.AWAITING_EMAIL_VERIFICATION,
        verificationStatus: VerificationStatus.PENDING,
        emailVerificationStatus: VerificationStatus.PENDING,
      },
    );

    await this.email.sendRegistrationVerificationCode(
      personalInfo.email,
      personalInfo.firstName,
      plainCode,
      this.auth.regVerificationCodeTtlSeconds,
    );

    return this.requireSession(session.id);
  }

  async resendEmailCode(sessionId: string): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(sessionId);
    const personalInfo = this.requirePersonalInfoPayload(session);
    this.ensureStep(
      session,
      RegistrationStep.AWAITING_EMAIL_VERIFICATION,
      'Email verification is not available for this session.',
    );
    const active = await this.getActiveVerification(
      session.id,
      NotificationChannel.EMAIL,
    );
    if (!active) {
      throw new BadRequestException('No pending email verification to resend.');
    }
    this.ensureResendAllowed(active);

    const { plainCode } = await this.issueVerification(
      session.id,
      NotificationChannel.EMAIL,
      active.resendCount + 1,
      {
        currentStep: RegistrationStep.AWAITING_EMAIL_VERIFICATION,
        verificationStatus: VerificationStatus.PENDING,
        emailVerificationStatus: VerificationStatus.PENDING,
      },
    );

    await this.email.sendRegistrationVerificationCode(
      personalInfo.email,
      personalInfo.firstName,
      plainCode,
      this.auth.regVerificationCodeTtlSeconds,
    );

    return this.requireSession(session.id);
  }

  async verifyEmailCode(
    sessionId: string,
    code: string,
  ): Promise<RegistrationSession> {
    const session = await this.requireOpenSession(sessionId);
    this.ensureStep(
      session,
      RegistrationStep.AWAITING_EMAIL_VERIFICATION,
      'Email verification is not active for this session.',
    );
    const verification = await this.getActiveVerification(
      session.id,
      NotificationChannel.EMAIL,
    );
    if (!verification) {
      throw new UnauthorizedException('No email verification is pending.');
    }

    await this.ensureVerificationIsUsable(sessionId, verification);
    const match = await bcrypt.compare(code, verification.codeHash);
    if (!match) {
      await this.handleIncorrectCode(sessionId, verification);
      throw new UnauthorizedException('The verification code is incorrect.');
    }

    await this.dataSource.transaction(async (em) => {
      await em.getRepository(RegistrationVerification).update(verification.id, {
        verifiedAt: new Date(),
      });

      await em.getRepository(RegistrationSession).update(session.id, {
        emailVerificationStatus: VerificationStatus.VERIFIED,
        verificationStatus: VerificationStatus.VERIFIED,
        currentStep: RegistrationStep.AWAITING_LOCATION,
      });
    });

    return this.requireSession(session.id);
  }

  private async issueVerification(
    sessionId: string,
    channel: NotificationChannel,
    resendCount: number,
    sessionUpdate: Partial<RegistrationSession>,
  ): Promise<{ plainCode: string }> {
    const now = new Date();
    const plainCode = generateSixDigitMfaCode();
    const codeHash = await bcrypt.hash(plainCode, this.auth.bcryptSaltRounds);
    const expiresAt = new Date(
      now.getTime() + this.auth.regVerificationCodeTtlSeconds * 1000,
    );

    await this.dataSource.transaction(async (em) => {
      await this.invalidatePendingInTx(em, sessionId, channel);
      const repo = em.getRepository(RegistrationVerification);
      const record = repo.create({
        registrationSessionId: sessionId,
        channel,
        codeHash,
        issuedAt: now,
        expiresAt,
        verifiedAt: null,
        invalidatedAt: null,
        attemptCount: 0,
        resendCount,
      });
      await repo.save(record);

      if (Object.keys(sessionUpdate).length > 0) {
        await em.getRepository(RegistrationSession).update(
          { id: sessionId },
          sessionUpdate as QueryDeepPartialEntity<RegistrationSession>,
        );
      }
    });

    return { plainCode };
  }

  private async handleIncorrectCode(
    sessionId: string,
    verification: RegistrationVerification,
  ): Promise<void> {
    const attempts = verification.attemptCount + 1;
    const maxAttempts = this.auth.regVerificationMaxAttempts;
    const shouldInvalidate = attempts >= maxAttempts;
    const updates: Partial<RegistrationVerification> = {
      attemptCount: attempts,
    };
    if (shouldInvalidate) {
      updates.invalidatedAt = new Date();
      const sessionUpdate: Partial<RegistrationSession> = {
        verificationStatus: VerificationStatus.FAILED,
      };
      if (verification.channel === NotificationChannel.WHATSAPP) {
        sessionUpdate.whatsappVerificationStatus = VerificationStatus.FAILED;
      }
      if (verification.channel === NotificationChannel.EMAIL) {
        sessionUpdate.emailVerificationStatus = VerificationStatus.FAILED;
      }
      await this.sessions.update(
        sessionId,
        sessionUpdate as QueryDeepPartialEntity<RegistrationSession>,
      );
    }
    await this.verifications.update(
      verification.id,
      updates as QueryDeepPartialEntity<RegistrationVerification>,
    );
  }

  private ensureResendAllowed(
    active: RegistrationVerification | null,
  ): void {
    if (!active) return;
    if (active.resendCount >= this.auth.regVerificationMaxResends) {
      throw new BadRequestException('Resend limit reached for this channel.');
    }
    const cooldownMs = this.auth.regVerificationResendCooldownSeconds * 1000;
    const nextAllowed = active.issuedAt.getTime() + cooldownMs;
    if (nextAllowed > Date.now()) {
      const waitSeconds = Math.ceil((nextAllowed - Date.now()) / 1000);
      throw new BadRequestException(
        `Please wait ${waitSeconds}s before requesting another code.`,
      );
    }
  }

  private async ensureVerificationIsUsable(
    sessionId: string,
    verification: RegistrationVerification,
  ): Promise<void> {
    if (verification.verifiedAt || verification.invalidatedAt) {
      throw new UnauthorizedException('Verification is no longer active.');
    }
    if (verification.expiresAt.getTime() <= Date.now()) {
      await this.verifications.update(
        verification.id,
        { invalidatedAt: new Date() } as QueryDeepPartialEntity<RegistrationVerification>,
      );
      const sessionUpdate: Partial<RegistrationSession> = {
        verificationStatus: VerificationStatus.FAILED,
      };
      if (verification.channel === NotificationChannel.WHATSAPP) {
        sessionUpdate.whatsappVerificationStatus = VerificationStatus.FAILED;
      }
      if (verification.channel === NotificationChannel.EMAIL) {
        sessionUpdate.emailVerificationStatus = VerificationStatus.FAILED;
      }
      await this.sessions.update(
        sessionId,
        sessionUpdate as QueryDeepPartialEntity<RegistrationSession>,
      );
      throw new UnauthorizedException('Verification code has expired.');
    }
    if (verification.attemptCount >= this.auth.regVerificationMaxAttempts) {
      await this.verifications.update(
        verification.id,
        { invalidatedAt: new Date() } as QueryDeepPartialEntity<RegistrationVerification>,
      );
      const sessionUpdate: Partial<RegistrationSession> = {
        verificationStatus: VerificationStatus.FAILED,
      };
      if (verification.channel === NotificationChannel.WHATSAPP) {
        sessionUpdate.whatsappVerificationStatus = VerificationStatus.FAILED;
      }
      if (verification.channel === NotificationChannel.EMAIL) {
        sessionUpdate.emailVerificationStatus = VerificationStatus.FAILED;
      }
      await this.sessions.update(
        sessionId,
        sessionUpdate as QueryDeepPartialEntity<RegistrationSession>,
      );
      throw new UnauthorizedException('Maximum verification attempts exceeded.');
    }
  }

  private async invalidatePendingInTx(
    em: EntityManager,
    sessionId: string,
    channel: NotificationChannel,
  ): Promise<void> {
    await em
      .createQueryBuilder()
      .update(RegistrationVerification)
      .set({ invalidatedAt: new Date() })
      .where('registration_session_id = :sessionId', { sessionId })
      .andWhere('channel = :channel', { channel })
      .andWhere('verified_at IS NULL')
      .andWhere('invalidated_at IS NULL')
      .execute();
  }

  private async getActiveVerification(
    sessionId: string,
    channel: NotificationChannel,
  ): Promise<RegistrationVerification | null> {
    return this.verifications.findOne({
      where: {
        registrationSessionId: sessionId,
        channel,
        verifiedAt: IsNull(),
        invalidatedAt: IsNull(),
      },
      order: { issuedAt: 'DESC' },
    });
  }

  private ensureStep(
    session: RegistrationSession,
    expectedStep: string,
    message: string,
  ) {
    if (session.currentStep !== expectedStep) {
      throw new BadRequestException(message);
    }
  }

  private requireContactPayload(session: RegistrationSession): ContactPayload {
    const contact =
      session.contactPayload as unknown as ContactPayload | null;
    if (!contact || !contact.normalizedWhatsappNumber) {
      throw new BadRequestException('Contact step has not been completed.');
    }
    return contact;
  }

  private requirePersonalInfoPayload(
    session: RegistrationSession,
  ): PersonalInfoPayload {
    const payload =
      session.personalInfoPayload as unknown as PersonalInfoPayload | null;
    if (!payload || !payload.email) {
      throw new BadRequestException(
        'Personal info step has not been completed.',
      );
    }
    return payload;
  }

  private async requireOpenSession(
    id: string,
  ): Promise<RegistrationSession> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException('Registration session not found.');
    }
    if (!session.expiresAt || session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Registration session has expired.');
    }
    return session;
  }

  private async requireSession(id: string): Promise<RegistrationSession> {
    const session = await this.sessions.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException('Registration session not found.');
    }
    return session;
  }
}
