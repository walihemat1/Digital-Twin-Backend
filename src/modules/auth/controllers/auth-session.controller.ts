import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { LoginDto } from '../dto/login.dto';
import { MfaResendDto } from '../dto/mfa-resend.dto';
import { MfaVerifyDto } from '../dto/mfa-verify.dto';
import { RefreshTokenBodyDto } from '../dto/refresh-token.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { AuthLoginService } from '../services/auth-login.service';
import { AuthTokensService } from '../services/auth-tokens.service';
import { MfaChallengeService } from '../services/mfa-challenge.service';
import { PasswordRecoveryService } from '../services/password-recovery.service';

@Controller('auth')
export class AuthSessionController {
  constructor(
    private readonly authLogin: AuthLoginService,
    private readonly mfa: MfaChallengeService,
    private readonly passwordRecovery: PasswordRecoveryService,
    private readonly authTokens: AuthTokensService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authLogin.login(dto);
  }

  @Post('mfa/verify')
  @HttpCode(HttpStatus.OK)
  verifyMfa(@Body() dto: MfaVerifyDto) {
    return this.mfa.verifyMfa(dto);
  }

  @Post('mfa/resend')
  @HttpCode(HttpStatus.OK)
  resendMfa(@Body() dto: MfaResendDto) {
    return this.mfa.resendMfa(dto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.passwordRecovery.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  reset(@Body() dto: ResetPasswordDto) {
    return this.passwordRecovery.resetPassword(dto);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshTokenBodyDto) {
    return this.authTokens.refreshSession(dto.refreshToken);
  }
}
