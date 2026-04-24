import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { normalizeEmail } from '../../../common/utils/normalization.util';
import { User } from '../../users/entities/user.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import authConfig from '../../../config/auth.config';
import {
  generateUrlSafeToken,
  hashOpaqueToken,
} from '../crypto/opaque-token.util';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { SendgridEmailService } from '../email/sendgrid-email.service';
import { AuthTokensService } from './auth-tokens.service';
import {
  isPasswordPolicyCompliant,
  passwordPolicyFailureMessage,
} from '../registration/password-policy';
import { PASSWORD_POLICY_VERSION } from '../registration/registration.constants';

@Injectable()
export class PasswordRecoveryService {
  private static readonly genericResponse = {
    message:
      'If that email is registered, you will receive password reset instructions shortly.',
  };

  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    private readonly email: SendgridEmailService,
    private readonly authTokens: AuthTokensService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = normalizeEmail(dto.email);
    const user = await this.users.findOne({ where: { email } });
    if (!user) {
      return { ...PasswordRecoveryService.genericResponse };
    }

    const raw = generateUrlSafeToken(40);
    const tokenHash = hashOpaqueToken(raw, this.auth.opaqueTokenPepper);
    const now = new Date();
    const row = this.resetTokens.create({
      userId: user.id,
      tokenHash,
      expiresAt: new Date(
        now.getTime() + this.auth.passwordResetTtlSeconds * 1000,
      ),
      usedAt: null,
    });
    await this.resetTokens.save(row);
    const base = this.auth.frontendAppBaseUrl.replace(/\/$/, '');
    const path = this.auth.passwordResetPath.startsWith('/')
      ? this.auth.passwordResetPath
      : `/${this.auth.passwordResetPath}`;
    const resetLink = `${base}${path}?token=${encodeURIComponent(raw)}`;
    await this.email.sendPasswordReset(user.email, user.firstName, resetLink);
    return { ...PasswordRecoveryService.genericResponse };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = hashOpaqueToken(dto.token, this.auth.opaqueTokenPepper);
    const record = await this.resetTokens.findOne({ where: { tokenHash } });
    const now = new Date();
    if (
      !record ||
      record.usedAt !== null ||
      record.expiresAt.getTime() <= now.getTime()
    ) {
      throw new BadRequestException(
        'This password reset link is invalid or has expired.',
      );
    }
    if (!isPasswordPolicyCompliant(dto.newPassword)) {
      throw new BadRequestException(passwordPolicyFailureMessage());
    }

    const user = await this.users.findOne({ where: { id: record.userId } });
    if (!user) {
      throw new BadRequestException(
        'This password reset link is invalid or has expired.',
      );
    }

    user.passwordHash = await bcrypt.hash(
      dto.newPassword,
      this.auth.bcryptSaltRounds,
    );
    user.passwordPolicyVersion = PASSWORD_POLICY_VERSION;
    record.usedAt = now;
    await this.users.save(user);
    await this.resetTokens.save(record);
    await this.authTokens.revokeAllForUser(user.id);
    return {
      message: 'Password was updated. You can sign in with your new password.',
    };
  }
}
