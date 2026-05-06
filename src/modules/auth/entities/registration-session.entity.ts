import { Column, Entity, Index } from 'typeorm';
import { VerificationStatus } from '../../../common/enums/verification-status.enum';
import { UserRole } from '../../../common/enums/user-role.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';

@Entity('registration_sessions')
@Index('IDX_registration_sessions_expires_at', ['expiresAt'])
export class RegistrationSession extends BaseEntity {
  @Column({
    name: 'selected_role',
    type: 'enum',
    enum: UserRole,
    enumName: 'user_role_enum',
    nullable: true,
  })
  selectedRole!: UserRole | null;

  @Column({ name: 'current_step', type: 'varchar', length: 64, nullable: true })
  currentStep!: string | null;

  @Column({ name: 'contact_payload', type: 'jsonb', nullable: true })
  contactPayload!: Record<string, unknown> | null;

  @Column({ name: 'personal_info_payload', type: 'jsonb', nullable: true })
  personalInfoPayload!: Record<string, unknown> | null;

  @Column({ name: 'location_payload', type: 'jsonb', nullable: true })
  locationPayload!: Record<string, unknown> | null;

  @Column({ name: 'recipient_details_payload', type: 'jsonb', nullable: true })
  recipientDetailsPayload!: Record<string, unknown> | null;

  @Column({
    name: 'whatsapp_verification_status',
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status_enum',
    default: VerificationStatus.NOT_STARTED,
  })
  whatsappVerificationStatus!: VerificationStatus;

  @Column({
    name: 'whatsapp_verification_sent_at',
    type: 'timestamptz',
    nullable: true,
  })
  whatsappVerificationSentAt!: Date | null;

  @Column({
    name: 'whatsapp_verified_at',
    type: 'timestamptz',
    nullable: true,
  })
  whatsappVerifiedAt!: Date | null;

  @Column({
    name: 'email_verification_status',
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status_enum',
    default: VerificationStatus.NOT_STARTED,
  })
  emailVerificationStatus!: VerificationStatus;

  @Column({
    name: 'email_verification_sent_at',
    type: 'timestamptz',
    nullable: true,
  })
  emailVerificationSentAt!: Date | null;

  @Column({
    name: 'email_verified_at',
    type: 'timestamptz',
    nullable: true,
  })
  emailVerifiedAt!: Date | null;

  @Column({
    name: 'verification_status',
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status_enum',
    default: VerificationStatus.UNVERIFIED,
  })
  verificationStatus!: VerificationStatus;

  @Column({
    name: 'whatsapp_verification_status',
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status_enum',
    default: VerificationStatus.UNVERIFIED,
  })
  whatsappVerificationStatus!: VerificationStatus;

  @Column({
    name: 'email_verification_status',
    type: 'enum',
    enum: VerificationStatus,
    enumName: 'verification_status_enum',
    default: VerificationStatus.UNVERIFIED,
  })
  emailVerificationStatus!: VerificationStatus;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;
}
