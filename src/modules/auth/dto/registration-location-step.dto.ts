import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegistrationLocationStepDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  country!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  stateProvince?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(512)
  addressLine1!: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  addressLine2?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  cityTown!: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  zipCode?: string;

  @IsString()
  @MinLength(4)
  @MaxLength(64)
  phoneNumber!: string;
}
