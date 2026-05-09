import { BadRequestException } from '@nestjs/common';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { Transaction } from './entities/transaction.entity';

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
