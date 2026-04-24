import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { AccountStatus } from '../../../common/enums/account-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { User } from '../../users/entities/user.entity';
import { MfaChallenge } from '../entities/mfa-challenge.entity';
import { SendgridEmailService } from '../email/sendgrid-email.service';
import { MfaChallengeService } from './mfa-challenge.service';
import { AuthTokensService } from './auth-tokens.service';
import type { ConfigType } from '@nestjs/config';
import authConfig from '../../../config/auth.config';

describe('MfaChallengeService (verifyMfa)', () => {
  let service: MfaChallengeService;
  const mfaFindOne = jest.fn();
  const mfaSave = jest.fn();
  const mfaUpdate = jest.fn();
  const userFind = jest.fn();
  const userSave = jest.fn();
  const buildTokenPair = jest.fn();
  const email = { sendLoginMfaCode: jest.fn() };
  const dataSource = {
    transaction: jest.fn(),
  };

  const authConf: ConfigType<typeof authConfig> = {
    accessTokenSecret: 'x',
    accessTokenExpiresIn: '15m',
    refreshTokenSecret: 'y',
    refreshTokenExpiresIn: '7d',
    bcryptSaltRounds: 4,
    opaqueTokenPepper: 'pepper',
    mfaCodeTtlSeconds: 600,
    passwordResetTtlSeconds: 3600,
    frontendAppBaseUrl: 'http://localhost',
    passwordResetPath: '/r',
    sendgridApiKey: '',
    emailFrom: '',
  };

  beforeEach(async () => {
    mfaFindOne.mockReset();
    mfaSave.mockReset();
    mfaUpdate.mockReset();
    userFind.mockReset();
    userSave.mockReset();
    buildTokenPair.mockReset();
    buildTokenPair.mockResolvedValue({
      accessToken: 'at',
      refreshToken: 'rt',
    });
    dataSource.transaction.mockReset();

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        MfaChallengeService,
        {
          provide: getRepositoryToken(MfaChallenge),
          useValue: { findOne: mfaFindOne, save: mfaSave, update: mfaUpdate },
        },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne: userFind, save: userSave },
        },
        { provide: AuthTokensService, useValue: { buildTokenPair } },
        { provide: SendgridEmailService, useValue: email },
        { provide: DataSource, useValue: dataSource },
        { provide: authConfig.KEY, useValue: authConf },
      ],
    }).compile();
    service = mod.get(MfaChallengeService);
  });

  it('rejects when challenge is missing', async () => {
    mfaFindOne.mockResolvedValue(null);
    await expect(
      service.verifyMfa({ mfaChallengeId: 'id', code: '123456' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects on wrong code', async () => {
    const codeHash = await bcrypt.hash('111111', 4);
    mfaFindOne.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      codeHash,
      verifiedAt: null,
      invalidatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
    });
    userFind.mockResolvedValue({
      id: 'u1',
      accountStatus: AccountStatus.ACTIVE,
    });
    await expect(
      service.verifyMfa({ mfaChallengeId: 'c1', code: '999999' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mfaUpdate).toHaveBeenCalledWith('c1', { attemptCount: 1 });
    expect(buildTokenPair).not.toHaveBeenCalled();
  });

  it('issues tokens on correct code', async () => {
    const code = '424242';
    const codeHash = await bcrypt.hash(code, 4);
    mfaFindOne.mockResolvedValue({
      id: 'c1',
      userId: 'u1',
      codeHash,
      verifiedAt: null,
      invalidatedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      attemptCount: 0,
    });
    const user = {
      id: 'u1',
      email: 'a@b.com',
      role: UserRole.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
      failedAttemptCount: 3,
      firstName: 'A',
    } as User;
    userFind.mockResolvedValue(user);
    const out = await service.verifyMfa({ mfaChallengeId: 'c1', code });
    expect(out).toEqual({ accessToken: 'at', refreshToken: 'rt' });
    expect(mfaSave).toHaveBeenCalled();
    expect(userSave).toHaveBeenCalledWith(
      expect.objectContaining({
        failedAttemptCount: 0,
        lastLoginAt: expect.any(Date),
      }),
    );
    expect(buildTokenPair).toHaveBeenCalledWith(user);
  });
});
