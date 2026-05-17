import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RecipientFeedback } from '../recipient-feedback/entities/recipient-feedback.entity';
import { RecipientFeedbackModule } from '../recipient-feedback/recipient-feedback.module';
import { Recipient } from '../recipients/entities/recipient.entity';
import { RecipientsModule } from '../recipients/recipients.module';
import { User } from '../users/entities/user.entity';
import { UserProfile } from '../users/entities/user-profile.entity';
import { BrokerALocalAgentDetail } from './entities/broker-a-local-agent-detail.entity';
import { CoordinatorAffirmation } from './entities/coordinator-affirmation.entity';
import { TransactionAuthCode } from './entities/transaction-auth-code.entity';
import { TransactionBrokerBAssignment } from './entities/transaction-broker-b-assignment.entity';
import { TransactionDeliveryVerificationAttempt } from './entities/transaction-delivery-verification-attempt.entity';
import { TransactionStatusHistory } from './entities/transaction-status-history.entity';
import { Transaction } from './entities/transaction.entity';
import { DeliveryAuthCodeCryptoService } from './delivery-auth-code-crypto.service';
import { TransactionCompletionService } from './transaction-completion.service';
import { TransactionsController } from './transactions.controller';
import { TransactionWorkflowHooks } from './transaction-workflow.hooks';
import { TransactionWorkflowNotificationService } from './transaction-workflow-notification.service';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Transaction,
      TransactionStatusHistory,
      TransactionBrokerBAssignment,
      TransactionAuthCode,
      TransactionDeliveryVerificationAttempt,
      BrokerALocalAgentDetail,
      CoordinatorAffirmation,
      RecipientFeedback,
      Recipient,
      User,
      UserProfile,
    ]),
    RecipientsModule,
    AuditModule,
    AuthModule,
    NotificationsModule,
    RecipientFeedbackModule,
  ],
  controllers: [TransactionsController],
  providers: [
    TransactionsService,
    TransactionCompletionService,
    TransactionWorkflowHooks,
    TransactionWorkflowNotificationService,
    DeliveryAuthCodeCryptoService,
  ],
  exports: [TransactionsService],
})
export class TransactionsModule {}
