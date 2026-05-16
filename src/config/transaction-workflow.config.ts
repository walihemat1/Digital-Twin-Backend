import { registerAs } from '@nestjs/config';

export default registerAs('transactionWorkflow', () => ({
  brokerADeclineReasonRequired:
    String(process.env.BROKER_A_DECLINE_REASON_REQUIRED ?? '')
      .toLowerCase()
      .trim() === 'true',
  brokerBDeclineReasonRequired:
    String(process.env.BROKER_B_DECLINE_REASON_REQUIRED ?? '')
      .toLowerCase()
      .trim() === 'true',
  /** Minutes until a Broker B delivery auth code expires after accept (default 24h). */
  brokerBDeliveryAuthCodeTtlMinutes: Number(
    process.env.BROKER_B_AUTH_CODE_TTL_MINUTES ?? 60 * 24,
  ),
}));
