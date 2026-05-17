import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class ListRecipientsQueryDto {
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

  /** `active` (default), `inactive`, or `all` for management lists. */
  @IsOptional()
  @IsIn(['active', 'inactive', 'all'])
  status?: 'active' | 'inactive' | 'all';

  @IsOptional()
  @IsIn(['updated_at', 'created_at', 'last_name', 'first_name', 'email'])
  sortBy?: 'updated_at' | 'created_at' | 'last_name' | 'first_name' | 'email';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortDir?: 'asc' | 'desc';
}
