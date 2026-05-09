import { BadRequestException } from '@nestjs/common';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { Transaction } from './entities/transaction.entity';

/**
 * Major workflow fields must not change after the transaction reaches a terminal workflow outcome.
 */
export function assertMajorWorkflowFieldsUnlocked(tx: Transaction): void {
  if (
    tx.status === TransactionStatus.COMPLETED ||
    tx.status === TransactionStatus.CANCELLED
  ) {
    throw new BadRequestException(
      'This transaction is finalized; workflow details can no longer be changed.',
    );
  }
}
