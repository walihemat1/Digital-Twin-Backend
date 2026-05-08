import { Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module';
import { BrokerATransactionsController } from './broker-a-transactions.controller';

@Module({
  imports: [TransactionsModule],
  controllers: [BrokerATransactionsController],
})
export class BrokerAModule {}
