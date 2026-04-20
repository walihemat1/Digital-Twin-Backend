import { Injectable, NotImplementedException } from '@nestjs/common';
import { LoginDto } from '../dto/login.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';
import { TokenPairDto } from '../dto/token-pair.dto';

@Injectable()
export class AuthService {
  async login(_payload: LoginDto): Promise<TokenPairDto> {
    throw new NotImplementedException('Auth login business logic is not implemented.');
  }

  async refresh(_payload: RefreshTokenDto): Promise<TokenPairDto> {
    throw new NotImplementedException(
      'Refresh-token business logic is not implemented.',
    );
  }
}
