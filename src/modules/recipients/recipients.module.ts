import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Recipient } from './entities/recipient.entity';
import { RecipientIdentityCryptoService } from './recipient-identity-crypto.service';
import { RecipientsController } from './recipients.controller';
import { RecipientsRepository } from './recipients.repository';
import { RecipientsService } from './recipients.service';

@Module({
  imports: [AuthModule, TypeOrmModule.forFeature([Recipient])],
  controllers: [RecipientsController],
  providers: [
    RecipientsRepository,
    RecipientsService,
    RecipientIdentityCryptoService,
  ],
  exports: [RecipientsService, RecipientsRepository, TypeOrmModule],
})
export class RecipientsModule {}
