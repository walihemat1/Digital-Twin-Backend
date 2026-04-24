import type { ApiErrorCode } from '../constants/api-error-codes';

export interface ApiErrorBody {
  code: ApiErrorCode | string;
  message: string;
  details?: unknown;
}

export interface ApiFailureResponse {
  success: false;
  error: ApiErrorBody;
  requestId?: string;
}
