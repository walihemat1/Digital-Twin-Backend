import 'reflect-metadata';
import { validateSync } from 'class-validator';
import { BrokerALocalAgentDetailsDto } from './broker-a-local-agent-details.dto';

describe('BrokerALocalAgentDetailsDto', () => {
  const brokerBUserId = '550e8400-e29b-41d4-a716-446655440000';

  it('accepts a valid payload', () => {
    const dto = new BrokerALocalAgentDetailsDto();
    dto.internalUserId = brokerBUserId;
    dto.organizationName = 'Acme Corp';
    dto.forwardingValue = 100.25;
    dto.localAgentName = 'Jane Agent';
    dto.localAgentPhone = '+15551234567';
    dto.coordinationMethod = 'WhatsApp';
    const errors = validateSync(dto);
    expect(errors).toHaveLength(0);
  });

  it('rejects when internalUserId is not a UUID', () => {
    const dto = new BrokerALocalAgentDetailsDto();
    dto.internalUserId = 'not-a-uuid';
    dto.organizationName = 'Acme Corp';
    dto.forwardingValue = 10;
    dto.localAgentName = 'Jane Agent';
    dto.localAgentPhone = '+15551234567';
    dto.coordinationMethod = 'WhatsApp';
    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects when organization name is empty', () => {
    const dto = new BrokerALocalAgentDetailsDto();
    dto.internalUserId = brokerBUserId;
    dto.organizationName = '';
    dto.forwardingValue = 10;
    dto.localAgentName = 'Jane Agent';
    dto.localAgentPhone = '+15551234567';
    dto.coordinationMethod = 'WhatsApp';
    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects when forwarding value is below minimum', () => {
    const dto = new BrokerALocalAgentDetailsDto();
    dto.internalUserId = brokerBUserId;
    dto.organizationName = 'Acme Corp';
    dto.forwardingValue = 0;
    dto.localAgentName = 'Jane Agent';
    dto.localAgentPhone = '+15551234567';
    dto.coordinationMethod = 'WhatsApp';
    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects when local agent phone is too short', () => {
    const dto = new BrokerALocalAgentDetailsDto();
    dto.internalUserId = brokerBUserId;
    dto.organizationName = 'Acme Corp';
    dto.forwardingValue = 10;
    dto.localAgentName = 'Jane Agent';
    dto.localAgentPhone = '1234';
    dto.coordinationMethod = 'WhatsApp';
    const errors = validateSync(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
