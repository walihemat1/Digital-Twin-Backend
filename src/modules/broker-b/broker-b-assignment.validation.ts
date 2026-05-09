import { BadRequestException } from '@nestjs/common';
import { BrokerBAssignmentType } from '../../common/enums/broker-b-assignment-type.enum';

function isUuidProvided(value: string | undefined | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Ensures assignment_type matches exactly one target id (internal user XOR external contact).
 */
export function assertBrokerBAssignmentTargetsValid(
  assignmentType: BrokerBAssignmentType,
  internalUserId: string | undefined | null,
  externalContactId: string | undefined | null,
): void {
  const hasInternal = isUuidProvided(internalUserId ?? undefined);
  const hasExternal = isUuidProvided(externalContactId ?? undefined);

  if (assignmentType === BrokerBAssignmentType.INTERNAL_USER) {
    if (!hasInternal || hasExternal) {
      throw new BadRequestException(
        'assignment_type internal_user requires internalUserId and must not include externalContactId.',
      );
    }
    return;
  }

  if (assignmentType === BrokerBAssignmentType.EXTERNAL_CONTACT) {
    if (!hasExternal || hasInternal) {
      throw new BadRequestException(
        'assignment_type external_contact requires externalContactId and must not include internalUserId.',
      );
    }
    return;
  }

  throw new BadRequestException('Invalid assignment_type.');
}
