import { Module } from '@nestjs/common';
import { TransactionSmsService } from './transaction-sms.service';

@Module({
  providers: [TransactionSmsService],
  exports: [TransactionSmsService],
})
export class NotificationsModule {}
