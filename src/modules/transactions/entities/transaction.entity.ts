import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { Recipient } from '../../recipients/entities/recipient.entity';
import { User } from '../../users/entities/user.entity';

@Entity('transactions')
@Index('IDX_transactions_coordinator_id', ['coordinatorId'])
@Index('IDX_transactions_recipient_id', ['recipientId'])
@Index('IDX_transactions_broker_a_user_id', ['brokerAUserId'])
@Index('IDX_transactions_status', ['status'])
@Index('IDX_transactions_submitted_at', ['submittedAt'])
export class Transaction extends BaseEntity {
  @Column({ name: 'coordinator_id', type: 'uuid' })
  coordinatorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'coordinator_id' })
  coordinator?: User;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @ManyToOne(() => Recipient, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recipient_id' })
  recipient?: Recipient;

  @Column({ name: 'broker_a_user_id', type: 'uuid' })
  brokerAUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'broker_a_user_id' })
  brokerAUser?: User;

  @Column({ name: 'transfer_method', type: 'varchar', length: 120 })
  transferMethod!: string;

  @Column({ name: 'verification_method', type: 'varchar', length: 120 })
  verificationMethod!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 12, default: 'USD' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    enumName: 'transaction_status_enum',
  })
  status!: TransactionStatus;

  @Column({ name: 'current_stage', type: 'varchar', length: 120, nullable: true })
  currentStage!: string | null;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;

  @Column({ name: 'delivery_confirmed_at', type: 'timestamptz', nullable: true })
  deliveryConfirmedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;
}
