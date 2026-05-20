import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { NotificationDeliveryStatus } from '../../common/enums/notification-delivery-status.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { SendgridEmailService } from '../auth/email/sendgrid-email.service';
import { TwilioVerifyService } from '../auth/registration/twilio-verify.service';
import { TransactionSmsService } from '../notifications/transaction-sms.service';
import { RecipientFeedbackAccessService } from '../recipient-feedback/recipient-feedback-access.service';
import { Recipient } from '../recipients/entities/recipient.entity';
import { TransactionAuthCode } from './entities/transaction-auth-code.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionWorkflowNotificationService } from './transaction-workflow-notification.service';

describe('TransactionWorkflowNotificationService', () => {
  let service: TransactionWorkflowNotificationService;
  let config: { getOrThrow: jest.Mock };
  let twilioVerify: { sendDeliveryAuthCodeSms: jest.Mock };
  let sms: { isReady: boolean; sendTransactionalSms: jest.Mock };
  let feedbackAccess: { issueAccessTokenForDeliveredTransaction: jest.Mock };
  let recipients: { findOne: jest.Mock };
  let authCodes: { update: jest.Mock };

  const tx = Object.assign(new Transaction(), {
    id: 'tx-1',
    coordinatorId: 'coord-1',
    recipientId: 'rec-1',
    amount: '100.50',
    currency: 'USD',
    status: TransactionStatus.DELIVERED,
  });

  const recipient = Object.assign(new Recipient(), {
    id: 'rec-1',
    phoneNumber: '+15551234567',
  });

  beforeEach(() => {
    config = {
      getOrThrow: jest.fn(() => ({
        frontendAppBaseUrl: 'http://localhost:5173',
      })),
    };
    twilioVerify = {
      sendDeliveryAuthCodeSms: jest.fn().mockResolvedValue(true),
    };
    sms = {
      isReady: true,
      sendTransactionalSms: jest.fn().mockResolvedValue(true),
    };
    feedbackAccess = {
      issueAccessTokenForDeliveredTransaction: jest
        .fn()
        .mockResolvedValue({ rawToken: 'feedback-token-abc' }),
    };
    recipients = {
      findOne: jest.fn().mockResolvedValue(recipient),
    };
    authCodes = {
      update: jest.fn().mockResolvedValue(undefined),
    };

    service = new TransactionWorkflowNotificationService(
      config as unknown as ConfigService,
      {} as SendgridEmailService,
      twilioVerify as unknown as TwilioVerifyService,
      sms as unknown as TransactionSmsService,
      feedbackAccess as unknown as RecipientFeedbackAccessService,
      {} as Repository<unknown> as Repository<never>,
      recipients as unknown as Repository<Recipient>,
      authCodes as unknown as Repository<TransactionAuthCode>,
    );
  });

  describe('buildDeliveryAuthSmsBody', () => {
    it('includes authentication code and expected amount', () => {
      const body = service.buildDeliveryAuthSmsBody(tx, '654321');
      expect(body).toContain('654321');
      expect(body).toContain('100.50');
      expect(body).toContain('USD');
      expect(body).not.toContain('/feedback/');
    });
  });

  describe('sendRecipientDeliveryAuthSms', () => {
    it('prefers transactional SMS with full message when Messages is configured', async () => {
      await service.sendRecipientDeliveryAuthSms(tx, recipient, '654321', 'code-id');

      expect(sms.sendTransactionalSms).toHaveBeenCalledWith(
        recipient.phoneNumber,
        expect.stringContaining('654321'),
      );
      expect(sms.sendTransactionalSms).toHaveBeenCalledWith(
        recipient.phoneNumber,
        expect.stringContaining('100.50 USD'),
      );
      expect(twilioVerify.sendDeliveryAuthCodeSms).not.toHaveBeenCalled();
      expect(authCodes.update).toHaveBeenCalledWith(
        { id: 'code-id' },
        { deliveryStatus: NotificationDeliveryStatus.SENT },
      );
    });

    it('falls back to Twilio Verify when transactional SMS is not ready', async () => {
      sms.isReady = false;

      await service.sendRecipientDeliveryAuthSms(tx, recipient, '654321', 'code-id');

      expect(sms.sendTransactionalSms).not.toHaveBeenCalled();
      expect(twilioVerify.sendDeliveryAuthCodeSms).toHaveBeenCalledWith(
        recipient.phoneNumber,
        '654321',
      );
    });
  });

  describe('issueFeedbackAndNotifyRecipient', () => {
    it('issues token and sends SMS body containing feedback URL', async () => {
      await service.issueFeedbackAndNotifyRecipient(tx);

      expect(feedbackAccess.issueAccessTokenForDeliveredTransaction).toHaveBeenCalledWith(
        tx.id,
      );
      expect(sms.sendTransactionalSms).toHaveBeenCalledWith(
        recipient.phoneNumber,
        expect.stringMatching(
          /Digital Twin: delivery confirmed for 100\.50 USD\..*http:\/\/localhost:5173\/feedback\/feedback-token-abc/,
        ),
      );
    });

    it('does nothing when transaction is not delivered', async () => {
      const pending = Object.assign(new Transaction(), {
        ...tx,
        status: TransactionStatus.BROKER_B_ACCEPTED,
      });

      await service.issueFeedbackAndNotifyRecipient(pending);

      expect(feedbackAccess.issueAccessTokenForDeliveredTransaction).not.toHaveBeenCalled();
      expect(sms.sendTransactionalSms).not.toHaveBeenCalled();
    });

    it('skips token issue and SMS when recipient is missing', async () => {
      recipients.findOne.mockResolvedValue(null);

      await service.issueFeedbackAndNotifyRecipient(tx);

      expect(feedbackAccess.issueAccessTokenForDeliveredTransaction).not.toHaveBeenCalled();
      expect(sms.sendTransactionalSms).not.toHaveBeenCalled();
    });
  });
});
