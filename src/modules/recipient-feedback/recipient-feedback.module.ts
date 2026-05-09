import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recipient } from '../recipients/entities/recipient.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { RecipientFeedbackAccessToken } from './entities/recipient-feedback-access-token.entity';
import { RecipientFeedback } from './entities/recipient-feedback.entity';
import { RecipientFeedbackAccessService } from './recipient-feedback-access.service';
import { RecipientFeedbackController } from './recipient-feedback.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecipientFeedbackAccessToken,
      RecipientFeedback,
      Transaction,
      Recipient,
    ]),
  ],
  controllers: [RecipientFeedbackController],
  providers: [RecipientFeedbackAccessService],
  exports: [RecipientFeedbackAccessService],
})
export class RecipientFeedbackModule {}
