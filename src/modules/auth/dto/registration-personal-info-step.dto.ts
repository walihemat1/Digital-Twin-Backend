import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class RegistrationPersonalInfoStepDto {
  @IsString()
  @MinLength(1)
  @Matches(/\S/, {
    message: 'firstName must contain non-whitespace characters',
  })
  @MaxLength(120)
  firstName!: string;

  @IsString()
  @MinLength(1)
  @Matches(/\S/, {
    message: 'lastName must contain non-whitespace characters',
  })
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
