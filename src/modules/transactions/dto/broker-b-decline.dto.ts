import { Transform, type TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class BrokerBDeclineDto {
  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}
