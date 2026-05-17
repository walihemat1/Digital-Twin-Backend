import { Injectable, Logger } from '@nestjs/common';
import { Transaction } from './entities/transaction.entity';
import { TransactionWorkflowNotificationService } from './transaction-workflow-notification.service';

/**
 * Extension points for workflow side effects (notifications, SMS, outbox, etc.).
 */
@Injectable()
export class TransactionWorkflowHooks {
  private readonly logger = new Logger(TransactionWorkflowHooks.name);

  constructor(
    private readonly notifications: TransactionWorkflowNotificationService,
  ) {}

  async onBrokerAAccepted(_tx: Transaction): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      this.logger.debug('onBrokerAAccepted');
    }
  }

  async onBrokerADeclined(_tx: Transaction, _reason: string | null): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      this.logger.debug('onBrokerADeclined');
    }
  }

  async onBrokerAReadyForBrokerB(_tx: Transaction): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      this.logger.debug('onBrokerAReadyForBrokerB');
    }
  }

  async onBrokerBAccepted(
    tx: Transaction,
    plainCode: string,
  ): Promise<void> {
    await this.notifications.notifyCoordinatorBrokerBAccepted(tx, plainCode);
  }

  async onBrokerBDeclined(_tx: Transaction, _reason: string | null): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      this.logger.debug('onBrokerBDeclined');
    }
  }

  async onBrokerBDeliveryConfirmed(tx: Transaction): Promise<void> {
    await this.notifications.notifyCoordinatorDeliveryConfirmed(tx);
    await this.notifications.issueFeedbackAndNotifyRecipient(tx);
  }
}
