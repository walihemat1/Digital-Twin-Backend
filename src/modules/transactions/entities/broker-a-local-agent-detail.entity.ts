import { Column, Entity, JoinColumn, ManyToOne, OneToOne } from 'typeorm';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { User } from '../../users/entities/user.entity';
import { Transaction } from './transaction.entity';

@Entity('broker_a_local_agent_details')
export class BrokerALocalAgentDetail extends BaseEntity {
  @Column({ name: 'transaction_id', type: 'uuid', unique: true })
  transactionId!: string;

  @OneToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: Transaction;

  @Column({ name: 'organization_name', type: 'varchar', length: 255 })
  organizationName!: string;

  @Column({ name: 'forwarding_value', type: 'decimal', precision: 18, scale: 2 })
  forwardingValue!: string;

  @Column({ name: 'local_agent_name', type: 'varchar', length: 255 })
  localAgentName!: string;

  @Column({ name: 'local_agent_phone', type: 'varchar', length: 40 })
  localAgentPhone!: string;

  @Column({ name: 'coordination_method', type: 'varchar', length: 120 })
  coordinationMethod!: string;

  @Column({ name: 'submitted_by', type: 'uuid' })
  submittedBy!: string;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'submitted_by' })
  submittedByUser?: User;

  @Column({ name: 'submitted_at', type: 'timestamptz' })
  submittedAt!: Date;
}
