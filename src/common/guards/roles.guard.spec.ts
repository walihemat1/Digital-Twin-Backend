import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../constants/auth.constants';
import { UserRole } from '../enums/user-role.enum';
import { RolesGuard } from './roles.guard';

function createContext(user: { userId: string; role: UserRole } | undefined) {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows access when user role is among required roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.BROKER_A]);

    const ok = guard.canActivate(
      createContext({ userId: 'u1', role: UserRole.BROKER_A }),
    );

    expect(ok).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, expect.any(Array));
  });

  it('denies access when user role is not among required roles (e.g. coordinator on Broker A routes)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.BROKER_A]);

    const ok = guard.canActivate(
      createContext({ userId: 'u1', role: UserRole.COORDINATOR_SENDER }),
    );

    expect(ok).toBe(false);
  });

  it('denies access when user is missing from request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.BROKER_A]);

    expect(() => guard.canActivate(createContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('allows access when no roles metadata is set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const ok = guard.canActivate(
      createContext({ userId: 'u1', role: UserRole.ADMIN }),
    );

    expect(ok).toBe(true);
  });
});
