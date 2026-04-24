import { IsUUID, IsNotEmpty } from 'class-validator';

export class MfaResendDto {
  @IsNotEmpty()
  @IsUUID('4')
  mfaChallengeId!: string;
}
