import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegistrationContactStepDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  @MaxLength(8)
  @Matches(/^\+\d{1,4}$/, {
    message: 'whatsappCountryCode must be in E.164 prefix form like +1',
  })
  whatsappCountryCode!: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  @MaxLength(32)
  whatsappNumber!: string;
}
