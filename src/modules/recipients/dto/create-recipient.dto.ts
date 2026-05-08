import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateRecipientDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MinLength(1)
  @MaxLength(255)
  firstName!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MinLength(1)
  @MaxLength(255)
  lastName!: string;

  @IsNotEmpty({ message: 'Phone country code is required' })
  @IsString()
  @MinLength(2)
  @MaxLength(8)
  @Matches(/^\+\d{1,4}$/, {
    message: 'phoneCountryCode must be in E.164 prefix form like +1',
  })
  phoneCountryCode!: string;

  @IsNotEmpty({ message: 'Phone number is required' })
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  phoneNumber!: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  issuingCountry?: string;

  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  identificationNumber?: string;
}
