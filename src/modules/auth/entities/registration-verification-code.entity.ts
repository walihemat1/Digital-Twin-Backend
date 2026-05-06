import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { NotificationChannel } from '../../../common/enums/notification-channel.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { RegistrationSession } from './registration-session.entity';

@Entity('registration_verification_codes')
@Index('IDX_reg_verification_session_channel', ['registrationSessionId', 'channel'])
export class RegistrationVerificationCode extends BaseEntity {
  @Column({ name: 'registration_session_id', type: 'uuid' })
  registrationSessionId!: string;

  @ManyToOne(() => RegistrationSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'registration_session_id' })
  registrationSession!: RegistrationSession;

  @Column({
    name: 'channel',
    type: 'enum',
    enum: NotificationChannel,
    enumName: 'notification_channel_enum',
  })
  channel!: NotificationChannel;

  @Column({ name: 'code_hash', type: 'varchar', length: 255 })
  codeHash!: string;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ name: 'invalidated_at', type: 'timestamptz', nullable: true })
  invalidatedAt!: Date | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'resend_count', type: 'int', default: 0 })
  resendCount!: number;
}
