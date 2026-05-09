import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BrokerBAssignmentStatus } from '../../../common/enums/broker-b-assignment-status.enum';
import { BrokerBAssignmentType } from '../../../common/enums/broker-b-assignment-type.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { ExternalContact } from '../../external-contacts/entities/external-contact.entity';
import { User } from '../../users/entities/user.entity';
import { Transaction } from './transaction.entity';

@Entity('transaction_broker_b_assignments')
@Index('IDX_tbba_transaction_id', ['transactionId'])
@Index('IDX_tbba_internal_user_id', ['internalUserId'])
@Index('IDX_tbba_external_contact_id', ['externalContactId'])
export class TransactionBrokerBAssignment extends BaseEntity {
  @Column({ name: 'transaction_id', type: 'uuid' })
  transactionId!: string;

  @ManyToOne(() => Transaction, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'transaction_id' })
  transaction?: Transaction;

  @Column({
    name: 'assignment_type',
    type: 'enum',
    enum: BrokerBAssignmentType,
    enumName: 'broker_b_assignment_type_enum',
  })
  assignmentType!: BrokerBAssignmentType;

  @Column({ name: 'internal_user_id', type: 'uuid', nullable: true })
  internalUserId!: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'internal_user_id' })
  internalUser?: User | null;

  @Column({ name: 'external_contact_id', type: 'uuid', nullable: true })
  externalContactId!: string | null;

  @ManyToOne(() => ExternalContact, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({ name: 'external_contact_id' })
  externalContact?: ExternalContact | null;

  @Column({
    name: 'assignment_status',
    type: 'enum',
    enum: BrokerBAssignmentStatus,
    enumName: 'broker_b_assignment_status_enum',
  })
  assignmentStatus!: BrokerBAssignmentStatus;

  @Column({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt!: Date;

  @Column({ name: 'responded_at', type: 'timestamptz', nullable: true })
  respondedAt!: Date | null;

  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  declineReason!: string | null;
}
