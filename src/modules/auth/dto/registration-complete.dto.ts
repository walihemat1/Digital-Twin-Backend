import { IsUUID } from 'class-validator';

export class RegistrationCompleteDto {
  @IsUUID('4')
  registrationSessionId!: string;
}
