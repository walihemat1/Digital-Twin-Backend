import { IsString, MaxLength, MinLength } from 'class-validator';

export class RejectApprovalRequestDto {
  @IsString()
  @MinLength(3)
  @MaxLength(2000)
  rejectionReason!: string;
}
