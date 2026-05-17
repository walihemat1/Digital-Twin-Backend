import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../users/entities/user.entity';
import { RecipientUserAccess } from './entities/recipient-user-access.entity';
import { Recipient } from './entities/recipient.entity';
import { RecipientIdentityCryptoService } from './recipient-identity-crypto.service';
import { RecipientsController } from './recipients.controller';
import { RecipientsRepository } from './recipients.repository';
import { RecipientsService } from './recipients.service';

@Module({
  imports: [
    AuthModule,
    AuditModule,
    TypeOrmModule.forFeature([
      Recipient,
      RecipientUserAccess,
      User,
      Transaction,
    ]),
  ],
  controllers: [RecipientsController],
  providers: [
    RecipientsRepository,
    RecipientsService,
    RecipientIdentityCryptoService,
  ],
  exports: [RecipientsService, RecipientsRepository, TypeOrmModule],
})
export class RecipientsModule {}
