import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { RecipientFeedback } from '../recipient-feedback/entities/recipient-feedback.entity';
import { RecipientsModule } from '../recipients/recipients.module';
import { User } from '../users/entities/user.entity';
import { UserProfile } from '../users/entities/user-profile.entity';
import { BrokerALocalAgentDetail } from './entities/broker-a-local-agent-detail.entity';
import { CoordinatorAffirmation } from './entities/coordinator-affirmation.entity';
import { TransactionAuthCode } from './entities/transaction-auth-code.entity';
import { TransactionBrokerBAssignment } from './entities/transaction-broker-b-assignment.entity';
import { TransactionStatusHistory } from './entities/transaction-status-history.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionCompletionService } from './transaction-completion.service';
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
      CoordinatorAffirmation,
      RecipientFeedback,
      User,
      UserProfile,
    ]),
    RecipientsModule,
    AuditModule,
  ],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionCompletionService,
    TransactionWorkflowHooks,
  ],
  exports: [TransactionsService],
})
export class TransactionsModule {}
