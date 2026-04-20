export enum TransactionStatus {
  PENDING = 'pending',
  BROKER_A_ACCEPTED = 'broker_a_accepted',
  BROKER_A_DECLINED = 'broker_a_declined',
  AWAITING_BROKER_B = 'awaiting_broker_b',
  BROKER_B_ACCEPTED = 'broker_b_accepted',
  BROKER_B_DECLINED = 'broker_b_declined',
  DELIVERED = 'delivered',
  FEEDBACK_SUBMITTED = 'feedback_submitted',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}
