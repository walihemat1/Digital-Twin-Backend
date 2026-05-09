import { BadRequestException } from '@nestjs/common';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { Transaction } from './entities/transaction.entity';
import { assertTransactionAwaitingBrokerBDeliveryConfirmation } from './broker-b-delivery.rules';

describe('assertTransactionAwaitingBrokerBDeliveryConfirmation', () => {
  const base = (): Transaction =>
    Object.assign(new Transaction(), {
      id: 't1',
      coordinatorId: 'c1',
      recipientId: 'r1',
      brokerAUserId: 'ba1',
      transferMethod: 'bank',
      verificationMethod: 'sms',
      amount: '10.00',
      currency: 'USD',
      description: null,
      status: TransactionStatus.BROKER_B_ACCEPTED,
      currentStage: null,
      submittedAt: new Date(),
      deliveryConfirmedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

  it('throws when status is not broker_b_accepted', () => {
    const tx = base();
    tx.status = TransactionStatus.AWAITING_BROKER_B;
    expect(() => assertTransactionAwaitingBrokerBDeliveryConfirmation(tx)).toThrow(
      BadRequestException,
    );
  });

  it('throws when delivery already confirmed', () => {
    const tx = base();
    tx.deliveryConfirmedAt = new Date();
    expect(() => assertTransactionAwaitingBrokerBDeliveryConfirmation(tx)).toThrow(
      BadRequestException,
    );
  });

  it('passes when awaiting confirmation', () => {
    expect(() => assertTransactionAwaitingBrokerBDeliveryConfirmation(base())).not.toThrow();
  });
});
