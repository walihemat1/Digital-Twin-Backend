import { BadRequestException } from '@nestjs/common';
import { BrokerBAssignmentStatus } from '../../common/enums/broker-b-assignment-status.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { TransactionBrokerBAssignment } from './entities/transaction-broker-b-assignment.entity';
import { Transaction } from './entities/transaction.entity';

/**
 * Broker B accept (`POST …/broker-b/accept`, US-BB-002).
 */
export function assertBrokerBCanAcceptAssignment(
  tx: Transaction,
  assignment: TransactionBrokerBAssignment,
): void {
  if (tx.status !== TransactionStatus.AWAITING_BROKER_B) {
    throw new BadRequestException(
      'Only a transaction awaiting Broker B can be accepted.',
    );
  }
  if (assignment.assignmentStatus !== BrokerBAssignmentStatus.ASSIGNED) {
    throw new BadRequestException(
      'Only an assigned Broker B assignment can be accepted.',
    );
  }
}

/**
 * Broker B decline (`POST …/broker-b/decline`, US-BB-003).
 */
export function assertBrokerBCanDeclineAssignment(
  tx: Transaction,
  assignment: TransactionBrokerBAssignment,
): void {
  if (tx.status !== TransactionStatus.AWAITING_BROKER_B) {
    throw new BadRequestException(
      'Only a transaction awaiting Broker B can be declined.',
    );
  }
  if (assignment.assignmentStatus !== BrokerBAssignmentStatus.ASSIGNED) {
    throw new BadRequestException(
      'Only an assigned Broker B assignment can be declined.',
    );
  }
}

/**
 * Centralized eligibility rules for Broker B delivery confirmation (TB-061 / US-BB-004).
 */
export function assertTransactionAwaitingBrokerBDeliveryConfirmation(
  tx: Transaction,
): void {
  if (tx.status !== TransactionStatus.BROKER_B_ACCEPTED) {
    throw new BadRequestException(
      'Delivery can only be confirmed while the transaction awaits delivery verification.',
    );
  }
  if (tx.deliveryConfirmedAt !== null) {
    throw new BadRequestException('Delivery has already been confirmed for this transaction.');
  }
}
