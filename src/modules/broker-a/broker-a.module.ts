import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { BrokerATransactionResponseController } from './broker-a-transaction-response.controller';
import { BrokerATransactionsController } from './broker-a-transactions.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [BrokerATransactionsController, BrokerATransactionResponseController],
})
export class BrokerAModule {}
