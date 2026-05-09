import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { RecipientFeedback } from '../recipient-feedback/entities/recipient-feedback.entity';
import { CoordinatorAffirmation } from './entities/coordinator-affirmation.entity';
import { Transaction } from './entities/transaction.entity';

/**
 * Centralized rules for coordinator affirmation + completion (TB-068 / TB-069, US-FIN-002 / US-FIN-003).
 */
export function assertTransactionEligibleForCoordinatorCompletion(
  tx: Transaction,
): void {
  if (tx.status === TransactionStatus.COMPLETED) {
    throw new ConflictException('This transaction is already completed.');
  }
  if (tx.status !== TransactionStatus.FEEDBACK_SUBMITTED) {
    throw new BadRequestException(
      'Affirmation is allowed only after recipient feedback has been submitted.',
    );
  }
}

export function assertRecipientFeedbackPresentForCompletion(
  feedback: RecipientFeedback | null | undefined,
): void {
  if (!feedback) {
    throw new BadRequestException(
      'Recipient feedback must exist before the transaction can be affirmed and completed.',
    );
  }
}

export function assertCoordinatorAffirmationNotYetRecorded(
  existing: CoordinatorAffirmation | null | undefined,
): void {
  if (existing) {
    throw new ConflictException(
      'This transaction has already been affirmed by the coordinator.',
    );
  }
}
