import { Transform, Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

function trimComment(value: unknown): unknown {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return value;
  const t = value.trim();
  return t.length > 0 ? t : undefined;
}

export class SubmitRecipientFeedbackDto {
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 2 })
  @Min(0.01)
  actualAmountReceived!: number;

  @IsOptional()
  @Transform(({ value }) => trimComment(value))
  @IsString()
  @MaxLength(4000)
  feedbackComment?: string;
}
