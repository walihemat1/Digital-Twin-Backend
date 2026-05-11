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
  @MinLength(8, {
    message: 'New password must be at least 8 characters long.',
  })
  @MaxLength(32, {
    message: 'New password must be at most 32 characters long.',
  })
  newPassword!: string;
}
