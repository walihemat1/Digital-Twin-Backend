import { SetMetadata } from '@nestjs/common';
import { ROLES_KEY } from '../constants/auth.constants';
import { UserRole } from '../enums/user-role.enum';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/**
 * --------------------------------------------------------------------------
 * Purpose of this File (`roles.decorator.ts`)
 * --------------------------------------------------------------------------
 *
 * This file defines the custom `@Roles` decorator for use with NestJS.
 * The purpose of the `@Roles` decorator is to specify required user roles
 * for accessing certain controller handlers (routes) or classes.
 *
 * How it works:
 * - The `@Roles(...roles)` decorator is a function that attaches metadata
 *   about which user roles are allowed to access a given resource.
 * - It uses NestJS's `SetMetadata` utility and the centralized `ROLES_KEY`
 *   constant to store an array of required `UserRole` enum values.
 * - Guard classes (such as a `RolesGuard`) can then retrieve this metadata
 *   to check if the currently authenticated user has one of the allowed roles,
 *   thereby enforcing role-based access control (RBAC) throughout the app.
 *
 * Example usage:
 *   @Roles(UserRole.ADMIN, UserRole.BROKER)
 *   @Get('admin-dashboard')
 *   getDashboard() { ... }
 *
 * This enables clear, declarative access restrictions,
 * improves code readability, and centralizes role metadata.
 */
