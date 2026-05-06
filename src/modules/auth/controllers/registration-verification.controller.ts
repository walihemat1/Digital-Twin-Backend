import { Body, Controller, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { RegistrationVerifyCodeDto } from '../dto/registration-verify-code.dto';
import { RegistrationVerificationService } from '../registration/registration-verification.service';

@Controller('auth')
export class RegistrationVerificationController {
  constructor(
    private readonly verification: RegistrationVerificationService,
  ) {}

  @Post('registration-sessions/:id/whatsapp-verification/send')
  sendWhatsapp(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.verification.sendWhatsappCode(id);
  }

  @Post('registration-sessions/:id/whatsapp-verification/resend')
  resendWhatsapp(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.verification.resendWhatsappCode(id);
  }

  @Post('registration-sessions/:id/whatsapp-verification/verify')
  verifyWhatsapp(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RegistrationVerifyCodeDto,
  ) {
    return this.verification.verifyWhatsappCode(id, dto.code);
  }

  @Post('registration-sessions/:id/email-verification/send')
  sendEmail(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.verification.sendEmailCode(id);
  }

  @Post('registration-sessions/:id/email-verification/resend')
  resendEmail(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string) {
    return this.verification.resendEmailCode(id);
  }

  @Post('registration-sessions/:id/email-verification/verify')
  verifyEmail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RegistrationVerifyCodeDto,
  ) {
    return this.verification.verifyEmailCode(id, dto.code);
  }
}
