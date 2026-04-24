import { IsString, IsUUID, Length, Matches, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';

export class MfaVerifyDto {
  @IsNotEmpty()
  @IsUUID('4')
  mfaChallengeId!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/, { message: 'Code must be 6 digits.' })
  code!: string;
}
