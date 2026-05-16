import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

/** Broker A search for active Broker B accounts when forwarding a transfer. */
export class ListEligibleBrokerBQueryDto {
  @IsOptional()
  @ValidateIf(
    (o: { q?: unknown }) => typeof o.q === 'string' && o.q.trim() !== '',
  )
  @IsString()
  @MinLength(2, {
    message: 'Search query must be at least 2 characters when provided.',
  })
  @MaxLength(100)
  q?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}
