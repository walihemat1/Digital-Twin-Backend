import {
  isPasswordPolicyCompliant,
  PASSWORD_POLICY_MAX_LENGTH,
  PASSWORD_POLICY_MIN_LENGTH,
} from './password-policy';

describe('password-policy', () => {
  const valid = 'Aa1!abcd';

  it(`accepts ${PASSWORD_POLICY_MIN_LENGTH}–${PASSWORD_POLICY_MAX_LENGTH} chars with required classes`, () => {
    expect(isPasswordPolicyCompliant(valid)).toBe(true);
  });

  it('rejects when too short', () => {
    expect(isPasswordPolicyCompliant('Aa1!')).toBe(false);
  });

  it('rejects when too long', () => {
    const tooLong = `${valid}${'x'.repeat(PASSWORD_POLICY_MAX_LENGTH)}`;
    expect(tooLong.length).toBeGreaterThan(PASSWORD_POLICY_MAX_LENGTH);
    expect(isPasswordPolicyCompliant(tooLong)).toBe(false);
  });

  it('rejects without uppercase', () => {
    expect(isPasswordPolicyCompliant('aa1!aaaa')).toBe(false);
  });

  it('rejects without lowercase', () => {
    expect(isPasswordPolicyCompliant('AA1!AAAA')).toBe(false);
  });

  it('rejects without digit', () => {
    expect(isPasswordPolicyCompliant('Aa!aaaaa')).toBe(false);
  });

  it('rejects without allowed special character', () => {
    expect(isPasswordPolicyCompliant('Aa1aaaaa')).toBe(false);
    expect(isPasswordPolicyCompliant('Aa1%aaaa')).toBe(false);
  });

  it('accepts each allowed special', () => {
    expect(isPasswordPolicyCompliant('Aa1!aaaa')).toBe(true);
    expect(isPasswordPolicyCompliant('Aa1/aaaa')).toBe(true);
    expect(isPasswordPolicyCompliant('Aa1@aaaa')).toBe(true);
    expect(isPasswordPolicyCompliant('Aa1#aaaa')).toBe(true);
    expect(isPasswordPolicyCompliant('Aa1$aaaa')).toBe(true);
  });
});
