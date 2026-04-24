import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { NotificationChannel } from '../../../common/enums/notification-channel.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity('mfa_challenges')
@Index('IDX_mfa_challenges_user_id_issued', ['userId', 'issuedAt'])
export class MfaChallenge extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'code_hash', type: 'varchar', length: 255 })
  codeHash!: string;

  @Column({
    name: 'delivery_channel',
    type: 'enum',
    enum: NotificationChannel,
    enumName: 'notification_channel_enum',
  })
  deliveryChannel!: NotificationChannel;

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
