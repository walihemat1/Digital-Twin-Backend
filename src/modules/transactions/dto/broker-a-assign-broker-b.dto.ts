import { IsUUID } from 'class-validator';

export class BrokerAAssignBrokerBDto {
  @IsUUID('4')
  internalUserId!: string;
}
