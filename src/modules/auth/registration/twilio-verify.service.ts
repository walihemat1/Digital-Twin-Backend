import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import authConfig from '../../../config/auth.config';

@Injectable()
export class TwilioVerifyService {
  private readonly log = new Logger(TwilioVerifyService.name);
  private readonly twilioClient: any | null = null;

  constructor(
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {
    const sidOk =
      !!this.auth.twilioAccountSid &&
      this.auth.twilioAccountSid.length > 0 &&
      !!this.auth.twilioAuthToken &&
      this.auth.twilioAuthToken.length > 0 &&
      !!this.auth.twilioVerifyServiceSid &&
      this.auth.twilioVerifyServiceSid.length > 0;

    if (sidOk) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio');
      this.twilioClient = twilio(
        this.auth.twilioAccountSid,
        this.auth.twilioAuthToken,
      );
    }
  }

  get isReady(): boolean {
    return this.twilioClient !== null;
  }

  async sendSmsVerification(phoneNumberE164: string): Promise<void> {
    if (!this.twilioClient) {
      throw new BadRequestException(
        'SMS verification is not configured (Twilio Verify).',
      );
    }
    try {
      await this.twilioClient.verify.v2
        .services(this.auth.twilioVerifyServiceSid)
        .verifications.create({
          to: phoneNumberE164,
          channel: 'sms',
        });
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message)
          : 'Twilio Verify request failed.';
      this.log.warn(`Twilio Verify send failed: ${msg}`);
      throw new BadRequestException(
        'Unable to send verification SMS. Check the phone number and try again.',
      );
    }
  }

  async checkVerification(
    phoneNumberE164: string,
    code: string,
  ): Promise<{ status: string }> {
    if (!this.twilioClient) {
      throw new BadRequestException(
        'SMS verification is not configured (Twilio Verify).',
      );
    }
    try {
      const check = await this.twilioClient.verify.v2
        .services(this.auth.twilioVerifyServiceSid)
        .verificationChecks.create({
          to: phoneNumberE164,
          code,
        });
      return { status: String(check.status ?? '') };
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message)
          : 'Twilio Verify check failed.';
      this.log.warn(`Twilio Verify check failed: ${msg}`);
      return { status: 'failed' };
    }
  }
}
