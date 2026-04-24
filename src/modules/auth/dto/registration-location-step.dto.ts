import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegistrationLocationStepDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  country!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stateProvince?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(5, { message: 'Address line 1 is required.' })
  @MaxLength(512)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  addressLine2?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(3, { message: 'City town is required.' })
  @MaxLength(120)
  cityTown!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  zipCode?: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MinLength(4, { message: 'Phone number is required.' })
  @MaxLength(64, { message: 'Phone number must be less than 64 characters.' })
  phoneNumber!: string;
}
