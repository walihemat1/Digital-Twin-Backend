import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../constants/auth.constants';
import { UserRole } from '../enums/user-role.enum';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    return requiredRoles.includes(user.role);
  }
}

/**
 * --------------------------------------------------------------------------
 * Purpose of this File (`roles.guard.ts`)
 * --------------------------------------------------------------------------
 *
 * This file implements the `RolesGuard` class, a NestJS guard used for
 * role-based access control (RBAC) throughout the application.
 *
 * How it works:
 * - The `RolesGuard` reads role metadata attached by the custom `@Roles` decorator.
 * - It uses NestJS's `Reflector` utility to access the required roles for a route handler or class.
 * - During request processing, the guard checks if the currently authenticated user
 *   (retrieved from `request.user`) possesses one of the required roles.
 * - If the user is not found or lacks the necessary role, access to the route is denied.
 * - If no roles are specified for the route, the guard allows access.
 *
 * The guard enables strong, declarative authorization checks to be layered on
 * application routes and controllers, ensuring only users with the appropriate
 * permissions are able to access protected resources.
 *
 * Example usage in a controller:
 *   @UseGuards(JwtAuthGuard, RolesGuard)
 *   @Roles(UserRole.ADMIN)
 *   @Get('protected-route')
 *   getProtectedResource() { ... }
 *
 * This promotes centralized, maintainable, and flexible role-based security
 * throughout the backend.
 */
