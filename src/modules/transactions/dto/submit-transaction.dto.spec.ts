import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { SubmitTransactionDto } from './submit-transaction.dto';

describe('SubmitTransactionDto (HTTP body)', () => {
  const validPlain = {
    recipientId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    brokerAUserId: 'b7eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    transferMethod: 'bank',
    verificationMethod: 'sms',
    amount: 100.5,
    currency: 'USD',
  };

  it('accepts a typical coordinator JSON body with forbidNonWhitelisted', async () => {
    const dto = plainToInstance(SubmitTransactionDto, validPlain);
    const errs = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errs).toHaveLength(0);
  });

  it('rejects unknown properties (forbidNonWhitelisted)', async () => {
    const dto = plainToInstance(SubmitTransactionDto, {
      ...validPlain,
      idempotencyKey: 'should-not-be-in-body',
    });
    const errs = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errs.length).toBeGreaterThan(0);
  });
});
