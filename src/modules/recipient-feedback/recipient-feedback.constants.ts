export const FeedbackAccessErrorCode = {
  TOKEN_INVALID: 'FEEDBACK_TOKEN_INVALID',
  TOKEN_EXPIRED: 'FEEDBACK_TOKEN_EXPIRED',
  /** Transaction is not in a state where recipient feedback applies (incl. before delivery). */
  TRANSACTION_NOT_ELIGIBLE: 'FEEDBACK_TRANSACTION_NOT_ELIGIBLE',
  /** Feedback was already submitted for this transaction. */
  FEEDBACK_ALREADY_SUBMITTED: 'FEEDBACK_ALREADY_SUBMITTED',
} as const;
