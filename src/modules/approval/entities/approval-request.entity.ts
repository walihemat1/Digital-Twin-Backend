import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApprovalRequestStatus } from '../../../common/enums/approval-request-status.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity('approval_requests')
@Index('IDX_approval_requests_status_created_at', ['status', 'createdAt'])
export class ApprovalRequest extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'request_type', type: 'varchar', length: 128 })
  requestType!: string;

  @Column({
    type: 'enum',
    enum: ApprovalRequestStatus,
    enumName: 'approval_request_status_enum',
  })
  status!: ApprovalRequestStatus;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedByUserId!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt!: Date | null;
}
