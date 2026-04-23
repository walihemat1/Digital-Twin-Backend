/**
 * Stable machine-readable API error codes for clients and logs.
 * Align new codes with `docs/New folder/technical_backlog.md` (TB-005).
 */
export const ApiErrorCode = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  HTTP_EXCEPTION: 'HTTP_EXCEPTION',
  DATABASE_CONFLICT: 'DATABASE_CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];
