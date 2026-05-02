import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import authConfig from '../../../config/auth.config';

@Injectable()
export class TwilioWhatsappService {
  private readonly log = new Logger(TwilioWhatsappService.name);
  private readonly isConfigured: boolean;
  private twilioClient: any | null = null;

  constructor(
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {
    this.isConfigured =
      !!this.auth.twilioAccountSid &&
      this.auth.twilioAccountSid.length > 0 &&
      !!this.auth.twilioAuthToken &&
      this.auth.twilioAuthToken.length > 0 &&
      !!this.auth.twilioFromNumber &&
      this.auth.twilioFromNumber.length > 0;
    if (this.isConfigured) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const twilio = require('twilio');
      this.twilioClient = twilio(
        this.auth.twilioAccountSid,
        this.auth.twilioAuthToken,
      );
    }
  }

  async sendVerificationCode(toNumber: string, code: string): Promise<void> {
    if (!this.isConfigured || !this.twilioClient) {
      this.log.warn(
        `WhatsApp verification skipped: Twilio not configured (to=${this.redact(
          toNumber,
        )}).`,
      );
      return;
    }

    const from = this.ensureWhatsappPrefix(this.auth.twilioFromNumber);
    const to = this.ensureWhatsappPrefix(toNumber);
    await this.twilioClient.messages.create({
      from,
      to,
      body: `Your verification code is ${code}. It expires in ${
        this.auth.regVerificationCodeTtlSeconds / 60
      } minutes.`,
    });
  }

  private ensureWhatsappPrefix(num: string): string {
    return num.startsWith('whatsapp:') ? num : `whatsapp:${num}`;
  }

  private redact(num: string): string {
    if (!num.startsWith('+')) return '***';
    const suffix = num.slice(-4);
    return `+***${suffix}`;
  }
}
