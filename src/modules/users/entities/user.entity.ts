import { Column, Entity, Index, OneToOne } from 'typeorm';
import { AccountStatus } from '../../../common/enums/account-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { UserProfile } from './user-profile.entity';

@Entity('users')
@Index('IDX_users_role', ['role'])
@Index('IDX_users_account_status', ['accountStatus'])
@Index('UQ_users_email_lower', { unique: true, expression: 'LOWER("email")' })
export class User extends BaseEntity {
  @Column({
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role_enum',
  })
  role!: UserRole;

  @Column({
    type: 'enum',
    enum: AccountStatus,
    enumName: 'user_account_status_enum',
    name: 'account_status',
  })
  accountStatus!: AccountStatus;

  @Column({ name: 'first_name' })
  firstName!: string;

  @Column({ name: 'last_name' })
  lastName!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  passwordHash!: string;

  @Column({ name: 'password_policy_version', type: 'varchar', nullable: true })
  passwordPolicyVersion!: string | null;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ name: 'failed_attempt_count', type: 'int', default: 0 })
  failedAttemptCount!: number;

  @OneToOne(() => UserProfile, (profile) => profile.user)
  profile?: UserProfile;
}
