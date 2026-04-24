import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { AccountStatus } from '../../../common/enums/account-status.enum';
import { NotificationChannel } from '../../../common/enums/notification-channel.enum';
import { User } from '../../users/entities/user.entity';
import { MfaChallenge } from '../entities/mfa-challenge.entity';
import authConfig from '../../../config/auth.config';
import { SendgridEmailService } from '../email/sendgrid-email.service';
import { generateSixDigitMfaCode } from '../crypto/opaque-token.util';
import { AuthTokensService } from './auth-tokens.service';
import { TokenPairDto } from '../dto/token-pair.dto';
import { MfaResendDto } from '../dto/mfa-resend.dto';
import { MfaVerifyDto } from '../dto/mfa-verify.dto';

@Injectable()
export class MfaChallengeService {
  constructor(
    @InjectRepository(MfaChallenge)
    private readonly mfa: Repository<MfaChallenge>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly email: SendgridEmailService,
    private readonly authTokens: AuthTokensService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * After valid email/password and active account: invalidate pending challenges and send new code.
   */
  async startLoginMfa(
    user: User,
  ): Promise<{ mfaChallengeId: string; expiresAt: string }> {
    const { challenge, plainCode } = await this.dataSource.transaction(
      async (em: EntityManager) => {
        await this.invalidatePendingChallengesInTx(em, user.id);
        return this.createChallengeInTx(em, user, 0);
      },
    );
    await this.email.sendLoginMfaCode(user.email, user.firstName, plainCode);
    return {
      mfaChallengeId: challenge.id,
      expiresAt: challenge.expiresAt.toISOString(),
    };
  }

  async verifyMfa(dto: MfaVerifyDto): Promise<TokenPairDto> {
    const ch = await this.mfa.findOne({ where: { id: dto.mfaChallengeId } });
    if (!ch) {
      throw new UnauthorizedException(
        'Invalid or expired verification request.',
      );
    }
    if (ch.verifiedAt !== null || ch.invalidatedAt !== null) {
      throw new UnauthorizedException('This code is no longer valid.');
    }
    if (ch.expiresAt.getTime() <= Date.now()) {
      await this.mfa.update(ch.id, { attemptCount: ch.attemptCount + 1 });
      throw new UnauthorizedException(
        'The code has expired. Request a new one.',
      );
    }

    const user = await this.users.findOne({ where: { id: ch.userId } });
    if (!user || user.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active.');
    }

    const match = await bcrypt.compare(dto.code, ch.codeHash);
    if (!match) {
      await this.mfa.update(ch.id, { attemptCount: ch.attemptCount + 1 });
      throw new UnauthorizedException('The code is incorrect.');
    }

    ch.verifiedAt = new Date();
    await this.mfa.save(ch);
    user.failedAttemptCount = 0;
    user.lastLoginAt = new Date();
    await this.users.save(user);
    return this.authTokens.buildTokenPair(user);
  }

  async resendMfa(dto: MfaResendDto): Promise<{
    mfaChallengeId: string;
    expiresAt: string;
    resendCount: number;
  }> {
    const existing = await this.mfa.findOne({
      where: { id: dto.mfaChallengeId },
    });
    if (!existing) {
      throw new NotFoundException('MFA request not found.');
    }
    if (existing.verifiedAt !== null) {
      throw new BadRequestException(
        'Login already completed for this request.',
      );
    }
    if (existing.invalidatedAt !== null) {
      throw new BadRequestException('This request is no longer active.');
    }

    const user = await this.users.findOne({ where: { id: existing.userId } });
    if (!user || user.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Account is not active.');
    }

    const { challenge, plainCode } = await this.dataSource.transaction(
      async (em: EntityManager) => {
        await this.invalidatePendingChallengesInTx(em, user.id);
        return this.createChallengeInTx(em, user, existing.resendCount + 1);
      },
    );
    await this.email.sendLoginMfaCode(user.email, user.firstName, plainCode);
    return {
      mfaChallengeId: challenge.id,
      expiresAt: challenge.expiresAt.toISOString(),
      resendCount: challenge.resendCount,
    };
  }

  private async invalidatePendingChallengesInTx(
    em: EntityManager,
    userId: string,
  ) {
    const now = new Date();
    await em
      .createQueryBuilder()
      .update(MfaChallenge)
      .set({ invalidatedAt: now })
      .where('user_id = :userId', { userId })
      .andWhere('verified_at IS NULL')
      .andWhere('invalidated_at IS NULL')
      .execute();
  }

  private async createChallengeInTx(
    em: EntityManager,
    user: User,
    resendCount: number,
  ): Promise<{ challenge: MfaChallenge; plainCode: string }> {
    const plainCode = generateSixDigitMfaCode();
    const codeHash = await bcrypt.hash(plainCode, this.auth.bcryptSaltRounds);
    const now = new Date();
    const ttlMs = this.auth.mfaCodeTtlSeconds * 1000;
    const c = em.getRepository(MfaChallenge).create({
      userId: user.id,
      codeHash,
      deliveryChannel: NotificationChannel.EMAIL,
      issuedAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
      verifiedAt: null,
      invalidatedAt: null,
      attemptCount: 0,
      resendCount,
    });
    const challenge = await em.getRepository(MfaChallenge).save(c);
    return { challenge, plainCode };
  }

  /**
   * Used only when MFA is tied to a pending JWT. Lists pending challenge for a user
   * when the client has no challenge id (e.g. legacy); not used in the happy path.
   */
  async getPendingChallengeForUser(
    userId: string,
  ): Promise<MfaChallenge | null> {
    return this.mfa.findOne({
      where: {
        userId,
        verifiedAt: IsNull(),
        invalidatedAt: IsNull(),
      },
      order: { issuedAt: 'DESC' },
    });
  }
}
