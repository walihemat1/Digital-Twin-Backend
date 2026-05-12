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

export class SearchRecipientsQueryDto {
  /** When omitted or empty, returns all active recipients (paginated). When set, min 2 characters. */
  @IsOptional()
  @ValidateIf((o) => o.q != null && String(o.q).trim() !== '')
  @IsString()
  @MinLength(2, { message: 'Search query must be at least 2 characters when provided.' })
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
