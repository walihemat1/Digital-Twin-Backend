import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { TransactionStatus } from '../../../common/enums/transaction-status.enum';

/**
 * Query strings arrive as strings; blank values must become `undefined` so `@IsOptional`
 * applies. Otherwise `@Type(() => Number)` turns `''` into `0` and `limit` fails `@Min(1)`.
 */
function emptyQueryToUndefined({ value }: { value: unknown }): unknown {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && value.trim() === '') return undefined;
  return value;
}

export class ListTransactionsQueryDto {
  @IsOptional()
  @Transform(emptyQueryToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;

  @IsOptional()
  @Transform(emptyQueryToUndefined)
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Transform(emptyQueryToUndefined)
  @IsEnum(TransactionStatus)
  status?: TransactionStatus;
}
