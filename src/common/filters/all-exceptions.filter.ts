import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { ApiErrorCode } from '../constants/api-error-codes';
import type { ApiFailureResponse } from '../interfaces/api-error-response.interface';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  /**
   * PostgreSQL error codes that indicate a client-visible constraint conflict
   * (safe to surface as 409). See https://www.postgresql.org/docs/current/errcodes-appendix.html
   */
  private static readonly PG_CONSTRAINT_CONFLICT_CODES = new Set<string>([
    '23505', // unique_violation
    '23503', // foreign_key_violation
    '23514', // check_violation
  ]);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { requestId?: string }>();

    const requestId = request.requestId;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const error = this.extractHttpError(exception.getResponse(), status);
      const body: ApiFailureResponse = {
        success: false,
        error,
        requestId,
      };
      response.status(status).json(body);
      return;
    }

    if (exception instanceof QueryFailedError) {
      const dbCode = this.getQueryFailedDriverCode(exception);
      if (
        dbCode &&
        AllExceptionsFilter.PG_CONSTRAINT_CONFLICT_CODES.has(dbCode)
      ) {
        this.logger.warn(
          `Database constraint conflict (${dbCode}): ${exception.message}`,
          exception.stack,
        );
        const body: ApiFailureResponse = {
          success: false,
          error: {
            code: ApiErrorCode.DATABASE_CONFLICT,
            message: 'A database constraint was violated.',
          },
          requestId,
        };
        response.status(HttpStatus.CONFLICT).json(body);
        return;
      }

      this.logger.error(
        `Database query failed${dbCode ? ` (${dbCode})` : ''}: ${exception.message}`,
        exception.stack,
      );
      try {
        this.logger.error(
          `Driver error payload: ${JSON.stringify(exception.driverError)}`,
        );
      } catch {
        this.logger.error('Driver error payload could not be serialized.');
      }

      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: {
          code: ApiErrorCode.INTERNAL_ERROR,
          message: 'An unexpected error occurred.',
        },
        requestId,
      } satisfies ApiFailureResponse);
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.message : 'Unknown error',
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: {
        code: ApiErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred.',
      },
      requestId,
    } satisfies ApiFailureResponse);
  }

  private getQueryFailedDriverCode(exception: QueryFailedError): string | undefined {
    const driver = exception.driverError as { code?: string } | undefined;
    if (driver && typeof driver.code === 'string') {
      return driver.code;
    }
    const root = exception as unknown as { code?: string };
    return typeof root.code === 'string' ? root.code : undefined;
  }

  /**
   * NestJS places non-string `HttpException` bodies under `response.message`.
   */
  private extractHttpError(
    resBody: string | object,
    status: number,
  ): ApiFailureResponse['error'] {
    if (typeof resBody === 'string') {
      return {
        code: ApiErrorCode.HTTP_EXCEPTION,
        message: resBody,
      };
    }

    const obj = resBody as Record<string, unknown>;

    if (typeof obj.code === 'string') {
      const message =
        typeof obj.errorMessage === 'string'
          ? obj.errorMessage
          : typeof obj.message === 'string'
            ? obj.message
            : 'Request failed';
      return {
        code: obj.code,
        message,
        details: obj.details,
      };
    }

    const rawMessage = obj.message;

    if (rawMessage && typeof rawMessage === 'object' && !Array.isArray(rawMessage)) {
      const m = rawMessage as Record<string, unknown>;
      if (typeof m.code === 'string' && typeof m.message === 'string') {
        return {
          code: m.code,
          message: m.message,
          details: m.details,
        };
      }
    }

    if (typeof rawMessage === 'string') {
      return { code: ApiErrorCode.HTTP_EXCEPTION, message: rawMessage };
    }

    if (Array.isArray(rawMessage)) {
      return {
        code: ApiErrorCode.VALIDATION_FAILED,
        message: 'Request validation failed',
        details: rawMessage,
      };
    }

    const statusLookup = HttpStatus as unknown as Record<number, string | undefined>;
    const statusKey = statusLookup[status];
    return {
      code: ApiErrorCode.HTTP_EXCEPTION,
      message: typeof statusKey === 'string' ? statusKey : 'Error',
    };
  }
}
