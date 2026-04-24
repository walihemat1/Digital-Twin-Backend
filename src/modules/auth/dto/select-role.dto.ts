import { IsEnum } from 'class-validator';
import { UserRole } from '../../../common/enums/user-role.enum';

export class SelectRoleDto {
  @IsEnum(UserRole, {
    message: 'role must be a supported UserRole value',
  })
  role!: UserRole;
}
