import { BadRequestException, HttpStatus } from '@nestjs/common';
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
});
