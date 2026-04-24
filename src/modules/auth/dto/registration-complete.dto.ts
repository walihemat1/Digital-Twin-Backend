import { IsNotEmpty, IsUUID } from 'class-validator';

export class RegistrationCompleteDto {
  @IsNotEmpty()
  @IsUUID('4')
  registrationSessionId!: string;
}
