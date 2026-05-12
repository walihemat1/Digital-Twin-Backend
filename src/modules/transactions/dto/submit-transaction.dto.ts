import { Transform, Type, type TransformFnParams } from 'class-transformer';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class SubmitTransactionDto {
  @Transform(trimString)
  @IsUUID('4')
  recipientId!: string;

  @Transform(trimString)
  @IsUUID('4')
  brokerAUserId!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  transferMethod!: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(120)
  verificationMethod!: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value === 'string' && value.trim() === '') return undefined;
    if (typeof value === 'string') return value.trim().toUpperCase();
    return value;
  })
  @IsString()
  @MinLength(3)
  @MaxLength(12)
  currency?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t.length > 0 ? t : undefined;
  })
  @IsString()
  @MaxLength(4000)
  description?: string;
}
