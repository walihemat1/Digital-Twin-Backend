import { BadRequestException, HttpStatus } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { AllExceptionsFilter } from './all-exceptions.filter';
import { ApiErrorCode } from '../constants/api-error-codes';

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  it('formats BadRequestException with structured message', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    filter.catch(
      new BadRequestException({
        code: ApiErrorCode.VALIDATION_FAILED,
        errorMessage: 'Request validation failed',
        details: [],
      }),
      {
        switchToHttp: () => ({
          getResponse: () => ({ status }),
          getRequest: () => ({ requestId: 'req-test' }),
        }),
      } as never,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        requestId: 'req-test',
        error: expect.objectContaining({
          code: ApiErrorCode.VALIDATION_FAILED,
          message: 'Request validation failed',
        }),
      }),
    );
  });

  it('maps Postgres unique_violation (23505) to 409 DATABASE_CONFLICT', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    filter.catch(
      new QueryFailedError('SELECT 1', [], { code: '23505' }),
      {
        switchToHttp: () => ({
          getResponse: () => ({ status }),
          getRequest: () => ({ requestId: 'req-test' }),
        }),
      } as never,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        requestId: 'req-test',
        error: expect.objectContaining({
          code: ApiErrorCode.DATABASE_CONFLICT,
        }),
      }),
    );
  });

  it('maps unknown QueryFailedError driver codes to 500 INTERNAL_ERROR', () => {
    const json = jest.fn();
    const status = jest.fn().mockReturnValue({ json });

    filter.catch(
      new QueryFailedError('SELECT bad', [], { code: '42601' }),
      {
        switchToHttp: () => ({
          getResponse: () => ({ status }),
          getRequest: () => ({ requestId: 'req-test' }),
        }),
      } as never,
    );

    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        requestId: 'req-test',
        error: expect.objectContaining({
          code: ApiErrorCode.INTERNAL_ERROR,
        }),
      }),
    );
  });
});
