import { IsString, Length } from 'class-validator';

export class RegistrationVerifyCodeDto {
  @IsString()
  @Length(4, 12)
  code!: string;
}
