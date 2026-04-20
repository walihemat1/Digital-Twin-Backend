import { IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @MinLength(10)
  refreshToken!: string; // this is the refresh token that is used to refresh the access token. the ! means that the refresh token is required.
}
