import { IsNotEmpty, IsString } from 'class-validator';

export class TokenPairDto {
  @IsNotEmpty()
  @IsString()
  accessToken!: string;

  @IsNotEmpty()
  @IsString()
  refreshToken!: string;
}
