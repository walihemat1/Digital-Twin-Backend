import { IsEnum, IsOptional } from 'class-validator';
import { ApprovalRequestStatus } from '../../../common/enums/approval-request-status.enum';

export class ListApprovalRequestsQueryDto {
  @IsOptional()
  @IsEnum(ApprovalRequestStatus)
  status?: ApprovalRequestStatus;
}
