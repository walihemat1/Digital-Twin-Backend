import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { AccountStatus } from '../../../common/enums/account-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { User } from '../../users/entities/user.entity';
import { AuthLoginService } from './auth-login.service';
import { MfaChallengeService } from './mfa-challenge.service';

describe('AuthLoginService', () => {
  let service: AuthLoginService;
  const mfa = { startLoginMfa: jest.fn() };
  const save = jest.fn();
  const findOne = jest.fn();

  beforeEach(async () => {
    save.mockReset();
    findOne.mockReset();
    mfa.startLoginMfa.mockReset();
    mfa.startLoginMfa.mockResolvedValue({
      mfaChallengeId: 'mfa-id',
      expiresAt: '2099-01-01T00:00:00.000Z',
    });

    const mod: TestingModule = await Test.createTestingModule({
      providers: [
        AuthLoginService,
        { provide: MfaChallengeService, useValue: mfa },
        {
          provide: getRepositoryToken(User),
          useValue: { findOne, save },
        },
      ],
    }).compile();
    service = mod.get(AuthLoginService);
  });

  function makeUser(over: Partial<User> = {}): User {
    return {
      id: 'u1',
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      passwordHash: 'h',
      passwordPolicyVersion: '1',
      lastLoginAt: null,
      failedAttemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...over,
    } as User;
  }

  it('on valid active user + password, starts MFA and returns challenge id', async () => {
    const hash = await bcrypt.hash('right-pass', 4);
    const user = makeUser({ passwordHash: hash });
    findOne.mockResolvedValue(user);
    const r = await service.login({
      email: 'A@B.COM',
      password: 'right-pass',
    });
    expect(r.mfaChallengeId).toBe('mfa-id');
    expect(mfa.startLoginMfa).toHaveBeenCalledWith(user);
  });

  it('fails on unknown email', async () => {
    findOne.mockResolvedValue(null);
    await expect(
      service.login({ email: 'x@y.com', password: 'p' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(mfa.startLoginMfa).not.toHaveBeenCalled();
  });

  it('fails on wrong password and bumps failed count', async () => {
    const hash = await bcrypt.hash('good', 4);
    const user = makeUser({ passwordHash: hash, failedAttemptCount: 2 });
    findOne.mockResolvedValue(user);
    await expect(
      service.login({ email: 'a@b.com', password: 'bad' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ failedAttemptCount: 3 }),
    );
  });

  it('fails on non-active account after password is correct', async () => {
    const hash = await bcrypt.hash('p', 4);
    const user = makeUser({
      passwordHash: hash,
      accountStatus: AccountStatus.SUSPENDED,
    });
    findOne.mockResolvedValue(user);
    await expect(
      service.login({ email: 'a@b.com', password: 'p' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mfa.startLoginMfa).not.toHaveBeenCalled();
  });
});
