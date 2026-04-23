const MIN_LENGTH = 12;

/**
 * Minimal server-side password rules for registration (TB-015).
 * Keep checks explicit and easy to extend when product policy tightens.
 */
export function isPasswordPolicyCompliant(password: string): boolean {
  if (password.length < MIN_LENGTH) {
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
  return true;
}

export function passwordPolicyFailureMessage(): string {
  return `Password must be at least ${MIN_LENGTH} characters and include uppercase, lowercase, and a number.`;
}
