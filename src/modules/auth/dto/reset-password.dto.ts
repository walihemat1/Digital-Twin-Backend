import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MinLength(1, { message: 'Token is required.' })
  token!: string;

  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @IsString()
  @MinLength(12, {
    message: 'New password must be at least 12 characters long.',
  })
  @MaxLength(128, {
    message: 'New password must be less than 128 characters long.',
  })
  newPassword!: string;
}
