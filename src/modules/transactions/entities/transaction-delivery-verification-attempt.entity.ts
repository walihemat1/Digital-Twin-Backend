import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { Transaction } from './transaction.entity';
import { User } from '../../users/entities/user.entity';

@Entity('transaction_delivery_verification_attempts')
@Index('IDX_tdva_transaction_id', ['transactionId'])
@Index('IDX_tdva_created_at', ['createdAt'])
export class TransactionDeliveryVerificationAttempt extends BaseEntity {
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: Transaction;

  @Column({ name: 'broker_b_user_id', type: 'uuid' })
  brokerBUserId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'broker_b_user_id' })
  brokerBUser?: User;

  @Column({ name: 'failure_reason', type: 'varchar', length: 64 })
  failureReason!: string;

  @Column({ name: 'code_valid', type: 'boolean', nullable: true })
  codeValid!: boolean | null;

  @Column({ name: 'amount_valid', type: 'boolean', nullable: true })
  amountValid!: boolean | null;
}
