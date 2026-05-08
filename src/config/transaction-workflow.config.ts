import { registerAs } from '@nestjs/config';

export default registerAs('transactionWorkflow', () => ({
  brokerADeclineReasonRequired:
    String(process.env.BROKER_A_DECLINE_REASON_REQUIRED ?? '')
      .toLowerCase()
      .trim() === 'true',
}));
