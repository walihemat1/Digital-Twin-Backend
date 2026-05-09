import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { NotificationDeliveryStatus } from '../../../common/enums/notification-delivery-status.enum';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { Recipient } from '../../recipients/entities/recipient.entity';
import { TransactionBrokerBAssignment } from './transaction-broker-b-assignment.entity';
import { Transaction } from './transaction.entity';

@Entity('transaction_auth_codes')
@Index('IDX_tac_transaction_id', ['transactionId'])
@Index('IDX_tac_expires_at', ['expiresAt'])
export class TransactionAuthCode extends BaseEntity {
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

  @Column({ name: 'broker_b_assignment_id', type: 'uuid' })
  brokerBAssignmentId!: string;

  @ManyToOne(() => TransactionBrokerBAssignment, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'broker_b_assignment_id' })
  brokerBAssignment?: TransactionBrokerBAssignment;

  @Column({ name: 'code_hash', type: 'varchar', length: 255 })
  codeHash!: string;

  @Column({ name: 'issued_at', type: 'timestamptz' })
  issuedAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'invalidated_at', type: 'timestamptz', nullable: true })
  invalidatedAt!: Date | null;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({
    name: 'delivery_status',
    type: 'enum',
    enum: NotificationDeliveryStatus,
    enumName: 'notification_delivery_status_enum',
    nullable: true,
  })
  deliveryStatus!: NotificationDeliveryStatus | null;
}
