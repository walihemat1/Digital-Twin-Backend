import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
  Matches,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';

export class RegistrationPersonalInfoStepDto {
  @Transform(({ value }) => {
    if (value == null) return undefined;
    if (typeof value !== 'string') return value;
    const t = value.trim();
    return t.length === 0 ? undefined : t;
  })
  @IsOptional()
  @IsString()
  @MaxLength(255, {
    message: 'Organization name must be at most 255 characters long.',
  })
  organizationName?: string;

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
  @MinLength(8, { message: 'Password must be at least 8 characters long.' })
  @MaxLength(32, {
    message: 'Password must be at most 32 characters long.',
  })
  password!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(8, {
    message: 'Password confirmation must be at least 8 characters long.',
  })
  @MaxLength(32, {
    message: 'Password confirmation must be at most 32 characters long.',
  })
  passwordConfirm!: string;
}
