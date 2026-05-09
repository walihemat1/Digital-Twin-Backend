import {
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import {
  assertCoordinatorAffirmationNotYetRecorded,
  assertRecipientFeedbackPresentForCompletion,
  assertTransactionEligibleForCoordinatorCompletion,
} from './transaction-completion.rules';
import { Transaction } from './entities/transaction.entity';

describe('transaction-completion.rules', () => {
  it('assertTransactionEligibleForCoordinatorCompletion accepts feedback_submitted', () => {
    const tx = { status: TransactionStatus.FEEDBACK_SUBMITTED } as Transaction;
    expect(() => assertTransactionEligibleForCoordinatorCompletion(tx)).not.toThrow();
  });

  it('assertTransactionEligibleForCoordinatorCompletion rejects other statuses', () => {
    const tx = { status: TransactionStatus.DELIVERED } as Transaction;
    expect(() => assertTransactionEligibleForCoordinatorCompletion(tx)).toThrow(
      BadRequestException,
    );
  });

  it('assertTransactionEligibleForCoordinatorCompletion conflicts when completed', () => {
    const tx = { status: TransactionStatus.COMPLETED } as Transaction;
    expect(() => assertTransactionEligibleForCoordinatorCompletion(tx)).toThrow(
      ConflictException,
    );
  });

  it('assertRecipientFeedbackPresentForCompletion rejects missing row', () => {
    expect(() => assertRecipientFeedbackPresentForCompletion(null)).toThrow(
      BadRequestException,
    );
  });

  it('assertCoordinatorAffirmationNotYetRecorded rejects duplicate', () => {
    expect(() => assertCoordinatorAffirmationNotYetRecorded({ id: 'a' } as any)).toThrow(
      ConflictException,
    );
  });
});
