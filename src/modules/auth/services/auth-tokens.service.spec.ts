import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from '../../users/entities/user.entity';
import { AccountStatus } from '../../../common/enums/account-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { RefreshToken } from '../entities/refresh-token.entity';
import {
  hashOpaqueToken,
  generateUrlSafeToken,
} from '../crypto/opaque-token.util';
import { AuthTokensService } from './auth-tokens.service';
import type { ConfigType } from '@nestjs/config';
import authConfig from '../../../config/auth.config';

describe('AuthTokensService (refreshSession)', () => {
  const refreshFind = jest.fn();
  const refreshSave = jest.fn();
  const createQb = {
    update: () => createQb,
    set: () => createQb,
    where: () => createQb,
    andWhere: () => createQb,
    execute: jest.fn(),
  };
  const refreshRepo = {
    findOne: refreshFind,
    save: refreshSave,
    create: (x: object) => x,
    manager: {
      getRepository: (cls: unknown) => {
        if (cls === User) {
          return { findOne: userFind };
        }
        return {};
      },
    },
    createQueryBuilder: () => createQb,
  };
  const userFind = jest.fn();
  const jwtSign = jest.fn().mockReturnValue('signed-access');

  const authConf: ConfigType<typeof authConfig> = {
    accessTokenSecret: 'acc',
    accessTokenExpiresIn: '15m',
    refreshTokenSecret: 'ref',
    refreshTokenExpiresIn: '7d',
    bcryptSaltRounds: 4,
    opaqueTokenPepper: 'pepper-32-chars--abcdefghij',
    mfaCodeTtlSeconds: 600,
    passwordResetTtlSeconds: 3600,
    frontendAppBaseUrl: 'http://x',
    passwordResetPath: '/p',
    sendgridApiKey: '',
    emailFrom: '',
  };

  let service: AuthTokensService;

  beforeEach(async () => {
    refreshFind.mockReset();
    refreshSave.mockReset();
    userFind.mockReset();
    jwtSign.mockClear();
    createQb.execute.mockReset();

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokensService,
        { provide: getRepositoryToken(RefreshToken), useValue: refreshRepo },
        { provide: JwtService, useValue: { sign: jwtSign } },
        { provide: authConfig.KEY, useValue: authConf },
      ],
    }).compile();
    service = mod.get(AuthTokensService);
  });

  it('rejects unknown refresh token', async () => {
    refreshFind.mockResolvedValue(null);
    await expect(
      service.refreshSession(generateUrlSafeToken(32)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rotates when token is valid and user is active', async () => {
    const raw = generateUrlSafeToken(32);
    const h = hashOpaqueToken(raw, authConf.opaqueTokenPepper);
    const u = {
      id: 'u1',
      email: 'a@b.com',
      role: UserRole.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
    } as User;
    refreshFind.mockResolvedValue({
      id: 'r1',
      userId: u.id,
      tokenHash: h,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 10_000),
    });
    userFind.mockResolvedValue(u);
    refreshSave.mockImplementation((x) => x);
    const pair = await service.refreshSession(raw);
    expect(pair.accessToken).toBe('signed-access');
    expect(pair.refreshToken).toBeDefined();
    expect(refreshSave).toHaveBeenCalled();
  });
});
