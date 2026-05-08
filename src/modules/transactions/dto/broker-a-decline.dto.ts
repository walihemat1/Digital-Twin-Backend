import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class BrokerADeclineDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}
