import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
  type ValidationError,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import { AllExceptionsFilter } from '../common/filters/all-exceptions.filter';
import { ApiErrorCode } from '../common/constants/api-error-codes';

// helper function to format validation errors for api returning responses
function buildValidationDetails(errors: ValidationError[]) {
  const details: Array<{
    property: string;
    constraints?: Record<string, string>;
  }> = [];

  const walk = (errs: ValidationError[], prefix = '') => {
    for (const e of errs) {
      const path = prefix ? `${prefix}.${e.property}` : e.property;
      if (e.constraints) {
        details.push({ property: path, constraints: e.constraints });
      }
      if (e.children?.length) {
        walk(e.children, path);
      }
    }
  };

  walk(errors);
  return details;
}

export function createGlobalValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors: ValidationError[]) =>
      new BadRequestException({
        code: ApiErrorCode.VALIDATION_FAILED,
        errorMessage: 'Request validation failed',
        details: buildValidationDetails(errors),
      }),
  });
}

export function configureApp(app: INestApplication): void {
  const configService = app.get(ConfigService);
  const apiPrefix = configService.get<string>('app.apiPrefix') ?? 'api';
  app.setGlobalPrefix(apiPrefix);

  app.use((req: Request, res: Response, next: NextFunction) => {
    const headerId = req.headers['x-request-id'];
    const requestId =
      typeof headerId === 'string' && headerId.length > 0
        ? headerId
        : randomUUID();
    (req as Request & { requestId: string }).requestId = requestId;
    res.setHeader('x-request-id', requestId);
    next();
  });

  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(createGlobalValidationPipe());
}
