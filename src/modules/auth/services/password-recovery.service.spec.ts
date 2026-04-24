import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../users/entities/user.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import {
  hashOpaqueToken,
  generateUrlSafeToken,
} from '../crypto/opaque-token.util';
import { PasswordRecoveryService } from './password-recovery.service';
import { AuthTokensService } from './auth-tokens.service';
import { SendgridEmailService } from '../email/sendgrid-email.service';
import type { ConfigType } from '@nestjs/config';
import authConfig from '../../../config/auth.config';

describe('PasswordRecoveryService', () => {
  const userFind = jest.fn();
  const tokenSave = jest.fn();
  const tokenFind = jest.fn();
  const revokeAll = jest.fn();
  const email = { sendPasswordReset: jest.fn() };

  const authConf: ConfigType<typeof authConfig> = {
    accessTokenSecret: 'x',
    accessTokenExpiresIn: '15m',
    refreshTokenSecret: 'y',
    refreshTokenExpiresIn: '7d',
    bcryptSaltRounds: 4,
    opaqueTokenPepper: 'test-pepper-32-chars-minimum-ok',
    mfaCodeTtlSeconds: 600,
    passwordResetTtlSeconds: 3600,
    frontendAppBaseUrl: 'https://app.example.com',
    passwordResetPath: '/reset',
    sendgridApiKey: 'k',
    emailFrom: 'f@e.com',
  };

  let service: PasswordRecoveryService;

  beforeEach(async () => {
    userFind.mockReset();
    tokenSave.mockReset();
    tokenFind.mockReset();
    revokeAll.mockReset();
    email.sendPasswordReset.mockReset();
    tokenSave.mockImplementation((x) => x);

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordRecoveryService,
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: userFind, save: jest.fn() },
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: {
            findOne: tokenFind,
            create: (x: object) => x,
            save: tokenSave,
          },
        },
        {
          provide: AuthTokensService,
          useValue: { revokeAllForUser: revokeAll },
        },
        { provide: SendgridEmailService, useValue: email },
        { provide: authConfig.KEY, useValue: authConf },
      ],
    }).compile();
    service = mod.get(PasswordRecoveryService);
  });

  it('forgotPassword returns generic text when user missing', async () => {
    userFind.mockResolvedValue(null);
    const r = await service.forgotPassword({ email: 'a@b.com' });
    expect(r.message).toContain('If that email is registered');
    expect(tokenSave).not.toHaveBeenCalled();
  });

  it('resetPassword rejects bad token', async () => {
    const raw = generateUrlSafeToken(8);
    tokenFind.mockResolvedValue(null);
    await expect(
      service.resetPassword({
        token: raw,
        newPassword: 'Abcdef1!@#',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(revokeAll).not.toHaveBeenCalled();
  });

  it('hashes token consistently for lookup', () => {
    const t = 'testtoken';
    expect(hashOpaqueToken(t, 'pep')).toBe(hashOpaqueToken(t, 'pep'));
    expect(hashOpaqueToken(t, 'pep')).not.toBe(hashOpaqueToken(t, 'pep2'));
  });
});
