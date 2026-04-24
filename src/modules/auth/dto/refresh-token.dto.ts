import { IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RefreshTokenBodyDto {
  @IsNotEmpty()
  @IsString()
  @MinLength(10, { message: 'Refresh token is required.' })
  refreshToken!: string;
}
