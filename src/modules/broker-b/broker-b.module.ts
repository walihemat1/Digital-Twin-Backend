import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalContactsModule } from '../external-contacts/external-contacts.module';
import { TransactionBrokerBAssignment } from '../transactions/entities/transaction-broker-b-assignment.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { UsersModule } from '../users/users.module';
import { BrokerBAssignmentService } from './broker-b-assignment.service';

@Module({
  imports: [
    ExternalContactsModule,
    UsersModule,
    TypeOrmModule.forFeature([Transaction, TransactionBrokerBAssignment]),
  ],
  providers: [BrokerBAssignmentService],
  exports: [BrokerBAssignmentService],
})
export class BrokerBModule {}
