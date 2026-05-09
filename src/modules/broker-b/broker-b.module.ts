import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalContactsModule } from '../external-contacts/external-contacts.module';
import { TransactionsModule } from '../transactions/transactions.module';
import { TransactionBrokerBAssignment } from '../transactions/entities/transaction-broker-b-assignment.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { UsersModule } from '../users/users.module';
import { BrokerBAssignmentService } from './broker-b-assignment.service';
import { BrokerBTransactionResponseController } from './broker-b-transaction-response.controller';
import { BrokerBTransactionsController } from './broker-b-transactions.controller';

@Module({
  imports: [
    ExternalContactsModule,
    UsersModule,
    TransactionsModule,
    TypeOrmModule.forFeature([Transaction, TransactionBrokerBAssignment]),
  ],
  controllers: [BrokerBTransactionsController, BrokerBTransactionResponseController],
  providers: [BrokerBAssignmentService],
  exports: [BrokerBAssignmentService],
})
export class BrokerBModule {}
