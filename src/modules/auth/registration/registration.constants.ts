import { UserRole } from '../../../common/enums/user-role.enum';

/** Public self-registration supports these roles only (see planning: Organization deferred; Admin not self-registered here). */
export const REGISTRATION_SELECTABLE_ROLES: readonly UserRole[] = [
  UserRole.COORDINATOR_SENDER,
  UserRole.BROKER_A,
  UserRole.BROKER_B,
  UserRole.RECIPIENT,
] as const;

export const REGISTRATION_REQUEST_TYPE_COORDINATOR_SENDER =
  'coordinator_sender_account';

export const PASSWORD_POLICY_VERSION = 'v1';

export const REGISTRATION_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const RegistrationStep = {
  AWAITING_ROLE: 'awaiting_role',
  AWAITING_CONTACT: 'awaiting_contact',
  AWAITING_PERSONAL_INFO: 'awaiting_personal_info',
  AWAITING_EMAIL_VERIFICATION: 'awaiting_email_verification',
  AWAITING_LOCATION: 'awaiting_location',
  AWAITING_RECIPIENT_DETAILS: 'awaiting_recipient_details',
  READY_TO_COMPLETE: 'ready_to_complete',
} as const;

export type RegistrationStep =
  (typeof RegistrationStep)[keyof typeof RegistrationStep];
