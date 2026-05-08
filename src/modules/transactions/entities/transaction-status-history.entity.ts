import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';
import { User } from '../../users/entities/user.entity';
import { Transaction } from './transaction.entity';

@Entity('transaction_status_history')
@Index('IDX_transaction_status_history_transaction_created', [
  'transactionId',
  'createdAt',
])
export class TransactionStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: Transaction;

  @Column({
    name: 'from_status',
    type: 'enum',
    enum: TransactionStatus,
    enumName: 'transaction_status_enum',
    nullable: true,
  })
  fromStatus!: TransactionStatus | null;

  @Column({
    name: 'to_status',
    type: 'enum',
    enum: TransactionStatus,
    enumName: 'transaction_status_enum',
  })
  toStatus!: TransactionStatus;

  @Column({ name: 'changed_by_user_id', type: 'uuid', nullable: true })
  changedByUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'changed_by_user_id' })
  changedByUser?: User | null;

  @Column({ name: 'change_reason', type: 'text', nullable: true })
  changeReason!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
