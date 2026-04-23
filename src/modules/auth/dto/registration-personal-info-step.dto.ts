import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegistrationPersonalInfoStepDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  passwordConfirm!: string;
}
