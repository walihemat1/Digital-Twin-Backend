import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Transaction } from './transaction.entity';

@Entity('coordinator_affirmations')
@Unique('UQ_coordinator_affirmations_transaction_id', ['transactionId'])
@Index('IDX_coordinator_affirmations_coordinator_id', ['coordinatorId'])
export class CoordinatorAffirmation {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: Transaction;

  @Column({ name: 'coordinator_id', type: 'uuid' })
  coordinatorId!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'coordinator_id' })
  coordinator?: User;

  @Column({ name: 'coordinator_comment', type: 'text', nullable: true })
  coordinatorComment!: string | null;

  @Column({ name: 'affirmed_at', type: 'timestamptz' })
  affirmedAt!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
