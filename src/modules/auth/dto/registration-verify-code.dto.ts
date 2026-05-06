import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RegistrationVerifyCodeDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(4)
  @MaxLength(10)
  @Matches(/^\d+$/, { message: 'code must contain digits only' })
  code!: string;
}
