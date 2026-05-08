import { Injectable, Logger } from '@nestjs/common';
import { Transaction } from './entities/transaction.entity';

/**
 * Minimal extension points for workflow side effects (notifications, outbox, etc.).
 * Default implementation is a no-op with debug logs in non-test environments.
 */
@Injectable()
export class TransactionWorkflowHooks {
  private readonly logger = new Logger(TransactionWorkflowHooks.name);

  async onBrokerAAccepted(_tx: Transaction): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      this.logger.debug('onBrokerAAccepted (no-op hook)');
    }
  }

  async onBrokerADeclined(_tx: Transaction, _reason: string | null): Promise<void> {
    if (process.env.NODE_ENV !== 'test') {
      this.logger.debug('onBrokerADeclined (no-op hook)');
    }
  }
}
