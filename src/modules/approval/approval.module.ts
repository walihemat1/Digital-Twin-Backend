import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { User } from '../users/entities/user.entity';
import { ApprovalRequestsService } from './approval-requests.service';
import { ApprovalRequest } from './entities/approval-request.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ApprovalRequest, User]),
    AuditModule,
  ],
  providers: [ApprovalRequestsService],
  exports: [ApprovalRequestsService],
})
export class ApprovalModule {}
