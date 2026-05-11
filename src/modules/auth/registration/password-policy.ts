export const PASSWORD_POLICY_MIN_LENGTH = 8;
export const PASSWORD_POLICY_MAX_LENGTH = 32;

/** Allowed special characters for passwords (aligned with registration UX). */
const SPECIAL_CHAR_RE = /[!/@#$]/;

/**
 * Server-side password rules for registration and password reset.
 * Keep checks explicit and aligned with the registration UI checklist.
 */
export function isPasswordPolicyCompliant(password: string): boolean {
  if (password.length < PASSWORD_POLICY_MIN_LENGTH) {
    return false;
  }
  if (password.length > PASSWORD_POLICY_MAX_LENGTH) {
    return false;
  }
  if (!/[a-z]/.test(password)) {
    return false;
  }
  if (!/[A-Z]/.test(password)) {
    return false;
  }
  if (!/\d/.test(password)) {
    return false;
  }
  if (!SPECIAL_CHAR_RE.test(password)) {
    return false;
  }
  return true;
}

export function passwordPolicyFailureMessage(): string {
  return `Password must be ${PASSWORD_POLICY_MIN_LENGTH}–${PASSWORD_POLICY_MAX_LENGTH} characters and include uppercase, lowercase, a number, and a special character (!, /, @, #, or $).`;
}
