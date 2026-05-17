import authConfig from '../../../config/auth.config';
import { TwilioVerifyService } from './twilio-verify.service';

describe('TwilioVerifyService', () => {
  const mockVerificationsCreate = jest.fn();
  const mockVerifyService = jest.fn(() => ({
    verifications: { create: mockVerificationsCreate },
  }));

  beforeEach(() => {
    jest.resetModules();
    mockVerificationsCreate.mockReset();
    mockVerificationsCreate.mockResolvedValue({ status: 'pending' });
    mockVerifyService.mockClear();
    jest.doMock('twilio', () =>
      jest.fn(() => ({
        verify: { v2: { services: mockVerifyService } },
      })),
    );
  });

  function createService(
    overrides: Partial<{
      twilioAccountSid: string;
      twilioAuthToken: string;
      twilioVerifyServiceSid: string;
    }> = {},
  ): TwilioVerifyService {
    const config = {
      twilioAccountSid: 'ACtest',
      twilioAuthToken: 'token',
      twilioVerifyServiceSid: 'VAtest',
      ...overrides,
    };
    return new TwilioVerifyService(config as typeof authConfig);
  }

  it('sendDeliveryAuthCodeSms returns false when Twilio is not configured', async () => {
    const service = createService({
      twilioAccountSid: '',
      twilioAuthToken: '',
      twilioVerifyServiceSid: '',
    });
    const sent = await service.sendDeliveryAuthCodeSms('+15551234567', '123456');
    expect(sent).toBe(false);
    expect(mockVerificationsCreate).not.toHaveBeenCalled();
  });

  it('sendDeliveryAuthCodeSms calls Verify with customCode when configured', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require('twilio');
    twilio.mockImplementation(() => ({
      verify: { v2: { services: mockVerifyService } },
    }));

    const service = createService();
    const sent = await service.sendDeliveryAuthCodeSms('+15551234567', '654321');

    expect(sent).toBe(true);
    expect(mockVerifyService).toHaveBeenCalledWith('VAtest');
    expect(mockVerificationsCreate).toHaveBeenCalledWith({
      to: '+15551234567',
      channel: 'sms',
      customCode: '654321',
    });
  });

  it('sendDeliveryAuthCodeSms returns false on Twilio error', async () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const twilio = require('twilio');
    twilio.mockImplementation(() => ({
      verify: { v2: { services: mockVerifyService } },
    }));
    mockVerificationsCreate.mockRejectedValue(new Error('rate limited'));

    const service = createService();
    const sent = await service.sendDeliveryAuthCodeSms('+15551234567', '111111');

    expect(sent).toBe(false);
  });
});
