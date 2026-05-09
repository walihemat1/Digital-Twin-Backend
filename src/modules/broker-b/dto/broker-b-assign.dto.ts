import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { BrokerBAssignmentType } from '../../../common/enums/broker-b-assignment-type.enum';

export class BrokerBAssignDto {
  @IsEnum(BrokerBAssignmentType)
  assignmentType!: BrokerBAssignmentType;

  @IsOptional()
  @IsUUID('4')
  internalUserId?: string;

  @IsOptional()
  @IsUUID('4')
  externalContactId?: string;
}
