import { BadRequestException } from '@nestjs/common';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { assertMajorWorkflowFieldsUnlocked } from './transaction-workflow-lock.rules';
import { Transaction } from './entities/transaction.entity';

describe('transaction-workflow-lock.rules', () => {
  it('allows non-terminal statuses', () => {
    expect(() =>
      assertMajorWorkflowFieldsUnlocked({
        status: TransactionStatus.FEEDBACK_SUBMITTED,
      } as Transaction),
    ).not.toThrow();
  });

  it('blocks completed transactions', () => {
    expect(() =>
      assertMajorWorkflowFieldsUnlocked({
        status: TransactionStatus.COMPLETED,
      } as Transaction),
    ).toThrow(BadRequestException);
  });

  it('blocks cancelled transactions', () => {
    expect(() =>
      assertMajorWorkflowFieldsUnlocked({
        status: TransactionStatus.CANCELLED,
      } as Transaction),
    ).toThrow(BadRequestException);
  });
});
