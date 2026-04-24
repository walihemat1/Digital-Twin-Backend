import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { ApprovalRequestsService } from './approval-requests.service';
import { ApprovalRequest } from './entities/approval-request.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ApprovalRequest]), AuditModule],
  providers: [ApprovalRequestsService],
  exports: [ApprovalRequestsService],
})
export class ApprovalModule {}
