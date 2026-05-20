import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthConfigValues } from '../../config/auth.config';
import { NotificationDeliveryStatus } from '../../common/enums/notification-delivery-status.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { SendgridEmailService } from '../auth/email/sendgrid-email.service';
import { TwilioVerifyService } from '../auth/registration/twilio-verify.service';
import { TransactionSmsService } from '../notifications/transaction-sms.service';
import { RecipientFeedbackAccessService } from '../recipient-feedback/recipient-feedback-access.service';
import { Recipient } from '../recipients/entities/recipient.entity';
import { User } from '../users/entities/user.entity';
import { TransactionAuthCode } from './entities/transaction-auth-code.entity';
import { Transaction } from './entities/transaction.entity';

@Injectable()
export class TransactionWorkflowNotificationService {
  private readonly log = new Logger(TransactionWorkflowNotificationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly email: SendgridEmailService,
    private readonly twilioVerify: TwilioVerifyService,
    private readonly sms: TransactionSmsService,
    private readonly feedbackAccess: RecipientFeedbackAccessService,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(Recipient)
    private readonly recipients: Repository<Recipient>,
    @InjectRepository(TransactionAuthCode)
    private readonly authCodes: Repository<TransactionAuthCode>,
  ) {}

  private authConfig(): AuthConfigValues {
    return this.config.getOrThrow<AuthConfigValues>('auth');
  }

  private feedbackUrl(rawToken: string): string {
    const base = this.authConfig().frontendAppBaseUrl.replace(/\/$/, '');
    return `${base}/feedback/${rawToken}`;
  }

  /** SMS body for delivery auth after Broker B accept (code + expected amount; no feedback link). */
  buildDeliveryAuthSmsBody(tx: Transaction, plainCode: string): string {
    return [
      'Digital Twin:',
      `Your authentication code is ${plainCode}.`,
      `Expected amount: ${tx.amount} ${tx.currency}.`,
      'Show this code to Broker B when you collect funds.',
    ].join(' ');
  }

  /** Logs recipient SMS payload to the server terminal (omitted in production). */
  private logRecipientSmsToTerminal(
    kind: string,
    fields: Record<string, string>,
  ): void {
    if (process.env.NODE_ENV === 'production') return;
    const body = Object.entries(fields)
      .map(([key, value]) => `  ${key}: ${value}`)
      .join('\n');
    this.log.log(`[Recipient SMS] ${kind}\n${body}`);
  }

  async notifyCoordinatorBrokerBAccepted(
    tx: Transaction,
    plainCode: string,
  ): Promise<void> {
    const coordinator = await this.users.findOne({
      where: { id: tx.coordinatorId },
    });
    if (!coordinator) return;

    await this.email.sendCoordinatorWorkflowUpdate(
      coordinator.email,
      coordinator.firstName,
      `Broker B has accepted transaction ${tx.id.slice(0, 8)}…. An authentication code was sent to the recipient by SMS. Use your dashboard to track delivery progress.`,
    );
    this.log.debug(`Coordinator notified of Broker B accept for tx=${tx.id}`);
  }

  async sendRecipientDeliveryAuthSms(
    tx: Transaction,
    recipient: Recipient,
    plainCode: string,
    authCodeId: string,
  ): Promise<void> {
    const message = this.buildDeliveryAuthSmsBody(tx, plainCode);
    let sent = false;
    let channel = 'none';

    if (this.sms.isReady) {
      sent = await this.sms.sendTransactionalSms(recipient.phoneNumber, message);
      channel = 'sms (Twilio Messages)';
    }
    if (!sent) {
      sent = await this.twilioVerify.sendDeliveryAuthCodeSms(
        recipient.phoneNumber,
        plainCode,
      );
      if (sent) {
        channel = 'sms (Twilio Verify; code only — configure TWILIO_FROM_NUMBER for full message with amount)';
      }
    }

    this.logRecipientSmsToTerminal('Delivery authentication', {
      to: recipient.phoneNumber,
      message,
      authenticationCode: plainCode,
      amount: `${tx.amount} ${tx.currency}`,
      transactionId: tx.id,
      channel,
      deliveryStatus: sent ? 'sent' : 'not_sent',
    });
    await this.authCodes.update(
      { id: authCodeId },
      {
        deliveryStatus: sent
          ? NotificationDeliveryStatus.SENT
          : NotificationDeliveryStatus.FAILED,
      },
    );
  }

  async notifyCoordinatorDeliveryConfirmed(tx: Transaction): Promise<void> {
    const coordinator = await this.users.findOne({
      where: { id: tx.coordinatorId },
    });
    if (!coordinator) return;

    await this.email.sendCoordinatorWorkflowUpdate(
      coordinator.email,
      coordinator.firstName,
      `Delivery verified for transaction ${tx.id.slice(0, 8)}…. Code and amount matched. The recipient will receive a feedback link by SMS.`,
    );
  }

  async issueFeedbackAndNotifyRecipient(tx: Transaction): Promise<void> {
    if (tx.status !== TransactionStatus.DELIVERED) return;

    const recipient = await this.recipients.findOne({
      where: { id: tx.recipientId },
    });
    if (!recipient) return;

    const { rawToken } =
      await this.feedbackAccess.issueAccessTokenForDeliveredTransaction(tx.id);
    const url = this.feedbackUrl(rawToken);
    const body = [
      `Digital Twin: delivery confirmed for ${tx.amount} ${tx.currency}.`,
      `Please share your feedback: ${url}`,
    ].join(' ');

    const sent = await this.sms.sendTransactionalSms(recipient.phoneNumber, body);
    this.logRecipientSmsToTerminal('Feedback invitation', {
      to: recipient.phoneNumber,
      feedbackLink: url,
      message: body,
      transactionId: tx.id,
      channel: 'sms (Twilio Messages)',
      deliveryStatus: sent ? 'sent' : 'not_sent',
    });
    if (!sent) {
      this.log.warn(
        `Feedback SMS skipped (TWILIO_FROM_NUMBER not configured) for tx=${tx.id}`,
      );
    }
  }
}
