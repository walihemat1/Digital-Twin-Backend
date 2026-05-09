import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecipientsModule } from '../recipients/recipients.module';
import { User } from '../users/entities/user.entity';
import { BrokerALocalAgentDetail } from './entities/broker-a-local-agent-detail.entity';
import { TransactionAuthCode } from './entities/transaction-auth-code.entity';
import { TransactionBrokerBAssignment } from './entities/transaction-broker-b-assignment.entity';
import { TransactionStatusHistory } from './entities/transaction-status-history.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionsController } from './transactions.controller';
import { TransactionWorkflowHooks } from './transaction-workflow.hooks';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      TransactionStatusHistory,
      TransactionBrokerBAssignment,
      TransactionAuthCode,
      BrokerALocalAgentDetail,
      User,
    ]),
    RecipientsModule,
  ],
  controllers: [TransactionsController],
  providers: [TransactionsService, TransactionWorkflowHooks],
  exports: [TransactionsService],
})
export class TransactionsModule {}
