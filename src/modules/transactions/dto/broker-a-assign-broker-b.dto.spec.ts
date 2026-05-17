import { validate } from 'class-validator';
import { BrokerAAssignBrokerBDto } from './broker-a-assign-broker-b.dto';

describe('BrokerAAssignBrokerBDto', () => {
  it('accepts a valid internal user id', async () => {
    const dto = new BrokerAAssignBrokerBDto();
    dto.internalUserId = '550e8400-e29b-41d4-a716-446655440000';
    const errors = await validate(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects missing internal user id', async () => {
    const dto = new BrokerAAssignBrokerBDto();
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
