import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecipientsModule } from '../recipients/recipients.module';
import { User } from '../users/entities/user.entity';
import { TransactionStatusHistory } from './entities/transaction-status-history.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionWorkflowHooks } from './transaction-workflow.hooks';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Transaction, TransactionStatusHistory, User]),
    RecipientsModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionWorkflowHooks],
  exports: [TransactionsService],
})
export class TransactionsModule {}
