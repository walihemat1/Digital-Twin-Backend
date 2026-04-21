import { UserRole } from '../../../common/enums/user-role.enum';

export interface JwtPayload {
  sub: string; // this is the subject of the token. it is the user id.
  email: string;
  role: UserRole;
  tokenType: 'access' | 'refresh'; // this is the type of the token. it is either access or refresh.
}
