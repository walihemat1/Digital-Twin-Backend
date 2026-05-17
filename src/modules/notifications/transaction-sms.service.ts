import {
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import authConfig from '../../config/auth.config';

/** Messages API SMS; requires TWILIO_FROM_NUMBER. Used for feedback links when configured. */
@Injectable()
export class TransactionSmsService {
  private readonly log = new Logger(TransactionSmsService.name);
  private readonly twilioClient: { messages: { create: (opts: object) => Promise<unknown> } } | null =
    null;

  constructor(
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {
    const sidOk =
      !!this.auth.twilioAccountSid &&
      this.auth.twilioAccountSid.length > 0 &&
      !!this.auth.twilioAuthToken &&
      this.auth.twilioAuthToken.length > 0 &&
      !!this.auth.twilioFromNumber &&
      this.auth.twilioFromNumber.length > 0;

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

  async sendTransactionalSms(toE164: string, body: string): Promise<boolean> {
    if (!this.twilioClient) {
      this.log.warn(
        `Transactional SMS skipped (Twilio not configured): to=${this.redactPhone(toE164)}`,
      );
      return false;
    }
    try {
      await this.twilioClient.messages.create({
        to: toE164,
        from: this.auth.twilioFromNumber,
        body,
      });
      return true;
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message?: unknown }).message)
          : 'Twilio SMS failed.';
      this.log.warn(`Transactional SMS failed: ${msg}`);
      return false;
    }
  }

  private redactPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 4) return '***';
    return `***${digits.slice(-4)}`;
  }
}
