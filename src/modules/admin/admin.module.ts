import { Module } from '@nestjs/common';
import { ApprovalModule } from '../approval/approval.module';
import { AuthModule } from '../auth/auth.module';
import { AdminApprovalRequestsController } from './controllers/admin-approval-requests.controller';

@Module({
  imports: [AuthModule, ApprovalModule],
  controllers: [AdminApprovalRequestsController],
})
export class AdminModule {}
