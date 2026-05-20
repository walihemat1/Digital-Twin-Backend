import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { Transaction } from './entities/transaction.entity';
import { TransactionWorkflowHooks } from './transaction-workflow.hooks';
import { TransactionWorkflowNotificationService } from './transaction-workflow-notification.service';

describe('TransactionWorkflowHooks', () => {
  let hooks: TransactionWorkflowHooks;
  let notifications: {
    notifyCoordinatorDeliveryConfirmed: jest.Mock;
    issueFeedbackAndNotifyRecipient: jest.Mock;
    notifyCoordinatorBrokerBAccepted: jest.Mock;
  };

  const deliveredTx = Object.assign(new Transaction(), {
    id: 'tx-1',
    status: TransactionStatus.DELIVERED,
    amount: '25.00',
    currency: 'USD',
  });

  beforeEach(() => {
    notifications = {
      notifyCoordinatorDeliveryConfirmed: jest.fn().mockResolvedValue(undefined),
      issueFeedbackAndNotifyRecipient: jest.fn().mockResolvedValue(undefined),
      notifyCoordinatorBrokerBAccepted: jest.fn().mockResolvedValue(undefined),
    };
    hooks = new TransactionWorkflowHooks(
      notifications as unknown as TransactionWorkflowNotificationService,
    );
  });

  it('onBrokerBDeliveryConfirmed notifies coordinator and issues feedback SMS', async () => {
    await hooks.onBrokerBDeliveryConfirmed(deliveredTx);

    expect(notifications.notifyCoordinatorDeliveryConfirmed).toHaveBeenCalledWith(
      deliveredTx,
    );
    expect(notifications.issueFeedbackAndNotifyRecipient).toHaveBeenCalledWith(
      deliveredTx,
    );
  });
});
