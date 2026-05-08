import { Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class SearchRecipientsQueryDto {
  @IsNotEmpty({ message: 'Search query is required' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  q!: string;

  @IsOptional({ message: 'Limit is required' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}
