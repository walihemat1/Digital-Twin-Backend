import { IsUUID } from 'class-validator';

export class CoordinatorChangeBrokerADto {
  @IsUUID('4')
  brokerAUserId!: string;
}
