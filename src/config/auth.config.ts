// this is the configuration for the auth module. It is used to store the configuration values for the auth module. The auth module is responsible for the authentication and authorization of the application. the auth module should include the following configuration values: access token secret, access token expires in, refresh token secret, refresh token expires in, and bcrypt salt rounds. Always remember to import this file in the app.module.ts file e.g (import authConfig from './config/auth.config';). And also remember to add the configuration values to the .env file.

// how does the app.module.ts file know which config file to use?
// the app.module.ts file knows which config file to use because it is imported in the app.module.ts file. The load function in the app.module.ts file is used to load the config files into the config module, which is then used to get the configuration values.
import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  accessTokenSecret:
    process.env.JWT_ACCESS_TOKEN_SECRET ?? 'change-this-access-secret',
  accessTokenExpiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN ?? '15m',
  refreshTokenSecret:
    process.env.JWT_REFRESH_TOKEN_SECRET ?? 'change-this-refresh-secret',
  refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN ?? '7d',
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS ?? 12),
  /** Env validation enforces a strong value in production. */
  opaqueTokenPepper:
    process.env.AUTH_OPAQUE_TOKEN_PEPPER ?? 'dev-opaque-token-pepper',
  mfaCodeTtlSeconds: Number(process.env.MFA_CODE_TTL_SECONDS ?? 600),
  passwordResetTtlSeconds: Number(
    process.env.PASSWORD_RESET_TTL_SECONDS ?? 3600,
  ),
  regVerificationCodeTtlSeconds: Number(
    process.env.REG_VERIFICATION_CODE_TTL_SECONDS ?? 600,
  ),
  regVerificationMaxAttempts: Number(
    process.env.REG_VERIFICATION_MAX_ATTEMPTS ?? 5,
  ),
  regVerificationMaxResends: Number(
    process.env.REG_VERIFICATION_MAX_RESENDS ?? 3,
  ),
  regVerificationResendCooldownSeconds: Number(
    process.env.REG_VERIFICATION_RESEND_COOLDOWN_SECONDS ?? 60,
  ),
  frontendAppBaseUrl:
    process.env.FRONTEND_APP_BASE_URL ?? 'http://localhost:3001',
  passwordResetPath: process.env.PASSWORD_RESET_PATH ?? '/auth/reset-password',
  sendgridApiKey: process.env.SENDGRID_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? '',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID ?? '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN ?? '',
  twilioFromNumber: process.env.TWILIO_FROM_NUMBER ?? '',
}));
