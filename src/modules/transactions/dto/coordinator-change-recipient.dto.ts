import { IsUUID } from 'class-validator';

export class CoordinatorChangeRecipientDto {
  @IsUUID('4')
  recipientId!: string;
}
