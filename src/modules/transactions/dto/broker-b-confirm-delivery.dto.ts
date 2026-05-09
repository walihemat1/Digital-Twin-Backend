import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class BrokerBConfirmDeliveryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(4)
  @MaxLength(64)
  code!: string;
}
