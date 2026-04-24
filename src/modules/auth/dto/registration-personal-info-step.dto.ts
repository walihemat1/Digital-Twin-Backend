import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  IsNotEmpty,
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

  @IsNotEmpty()
  @IsEmail({}, { message: 'Invalid email address.' })
  @MaxLength(320, { message: 'Email must be less than 320 characters long.' })
  email!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters long.' })
  @MaxLength(128, {
    message: 'Password must be less than 128 characters long.',
  })
  password!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(12, {
    message: 'Password confirmation must be at least 12 characters long.',
  })
  @MaxLength(128, {
    message: 'Password confirmation must be less than 128 characters long.',
  })
  passwordConfirm!: string;
}
