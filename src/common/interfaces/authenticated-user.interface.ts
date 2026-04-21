// this is the interface for the authenticated user. It is used to represent the authenticated user in the application. interface is a way to define the structure of an object.

import { UserRole } from '../enums/user-role.enum';

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
  email?: string;
}
