import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  Unique,
} from 'typeorm';
import { NotificationChannel } from '../../../common/enums/notification-channel.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { Recipient } from '../../recipients/entities/recipient.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';

@Entity('recipient_feedback')
@Unique('UQ_recipient_feedback_transaction_id', ['transactionId'])
@Index('IDX_recipient_feedback_recipient_id', ['recipientId'])
export class RecipientFeedback extends BaseEntity {
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: Transaction;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @ManyToOne(() => Recipient, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'recipient_id' })
  recipient?: Recipient;

  @Column({ name: 'feedback_comment', type: 'text', nullable: true })
  feedbackComment!: string | null;

  @Column({
    name: 'actual_amount_received',
    type: 'decimal',
    precision: 18,
    scale: 2,
  })
  actualAmountReceived!: string;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;

  @Column({
    name: 'source_channel',
    type: 'enum',
    enum: NotificationChannel,
    enumName: 'notification_channel_enum',
    nullable: true,
  })
  sourceChannel!: NotificationChannel | null;
}
