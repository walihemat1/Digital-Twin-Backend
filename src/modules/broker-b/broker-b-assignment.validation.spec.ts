import { BadRequestException } from '@nestjs/common';
import { BrokerBAssignmentType } from '../../common/enums/broker-b-assignment-type.enum';
import { assertBrokerBAssignmentTargetsValid } from './broker-b-assignment.validation';

describe('assertBrokerBAssignmentTargetsValid', () => {
  const uid = '550e8400-e29b-41d4-a716-446655440000';
  const cid = '660e8400-e29b-41d4-a716-446655440001';

  it('accepts internal_user with internalUserId only', () => {
    expect(() =>
      assertBrokerBAssignmentTargetsValid(
        BrokerBAssignmentType.INTERNAL_USER,
        uid,
        undefined,
      ),
    ).not.toThrow();
  });

  it('rejects internal_user without internalUserId', () => {
    expect(() =>
      assertBrokerBAssignmentTargetsValid(
        BrokerBAssignmentType.INTERNAL_USER,
        undefined,
        undefined,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects internal_user when externalContactId is also set', () => {
    expect(() =>
      assertBrokerBAssignmentTargetsValid(
        BrokerBAssignmentType.INTERNAL_USER,
        uid,
        cid,
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts external_contact with externalContactId only', () => {
    expect(() =>
      assertBrokerBAssignmentTargetsValid(
        BrokerBAssignmentType.EXTERNAL_CONTACT,
        undefined,
        cid,
      ),
    ).not.toThrow();
  });

  it('rejects external_contact without externalContactId', () => {
    expect(() =>
      assertBrokerBAssignmentTargetsValid(
        BrokerBAssignmentType.EXTERNAL_CONTACT,
        undefined,
        undefined,
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects external_contact when internalUserId is also set', () => {
    expect(() =>
      assertBrokerBAssignmentTargetsValid(
        BrokerBAssignmentType.EXTERNAL_CONTACT,
        uid,
        cid,
      ),
    ).toThrow(BadRequestException);
  });
});
