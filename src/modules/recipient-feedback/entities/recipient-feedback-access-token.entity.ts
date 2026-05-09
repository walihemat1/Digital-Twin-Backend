import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { Recipient } from '../../recipients/entities/recipient.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';

@Entity('recipient_feedback_access_tokens')
@Index('IDX_rfat_transaction_id', ['transactionId'])
@Index('IDX_rfat_expires_at', ['expiresAt'])
export class RecipientFeedbackAccessToken extends BaseEntity {
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

  @Column({ name: 'token_hash', type: 'varchar', length: 64 })
  tokenHash!: string;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'invalidated_at', type: 'timestamptz', nullable: true })
  invalidatedAt!: Date | null;
}
