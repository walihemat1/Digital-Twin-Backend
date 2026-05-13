import { IsUUID } from 'class-validator';

export class GrantRecipientCoordinatorAccessDto {
  @IsUUID('4')
  userId!: string;
}
