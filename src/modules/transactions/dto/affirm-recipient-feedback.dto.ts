import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AffirmRecipientFeedbackDto {
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  coordinatorComment?: string;
}
