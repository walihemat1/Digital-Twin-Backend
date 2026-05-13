import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { AuthModule } from '../auth/auth.module';
import { RecipientsModule } from '../recipients/recipients.module';
import { AdminApprovalRequestsController } from './controllers/admin-approval-requests.controller';
import { AdminRecipientsController } from './controllers/admin-recipients.controller';

@Module({
  imports: [AuthModule, ApprovalModule, RecipientsModule],
  controllers: [AdminApprovalRequestsController, AdminRecipientsController],
})
export class AdminModule {}
