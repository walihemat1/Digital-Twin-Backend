// an enum is a list of constants that are used to represent a set of related values. In this case, the user role is a list of constants that are used to represent the user role.

export enum UserRole {
  COORDINATOR_SENDER = 'coordinator_sender',
  BROKER_A = 'broker_a',
  BROKER_B = 'broker_b',
  /** Public self-service recipient registration; no full in-app shell in V1. */
  RECIPIENT = 'recipient',
  ADMIN = 'admin',
  ORGANIZATION = 'organization',
}
