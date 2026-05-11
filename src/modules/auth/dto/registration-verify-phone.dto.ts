import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const E164_PHONE = /^\+[1-9]\d{6,14}$/;

export class RegistrationVerifyPhoneDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(8)
  @MaxLength(16)
  @Matches(E164_PHONE, {
    message:
      'phoneNumber must be E.164 format (e.g. +93700123456): + and country code with 7–15 digits total.',
  })
  phoneNumber!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  @MaxLength(10)
  @Matches(/^\d+$/, { message: 'code must contain digits only' })
  code!: string;
}
