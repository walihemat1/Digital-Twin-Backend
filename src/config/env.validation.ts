import Joi from 'joi';

const defaultAccessSecret = 'change-this-access-secret';
const defaultRefreshSecret = 'change-this-refresh-secret';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').required(),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api'),
  SERVICE_NAME: Joi.string().default('digital-twin-backend'),

  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().allow('').default('postgres'),
  DB_NAME: Joi.string().default('digital_twin'),
  DB_SCHEMA: Joi.string().default('public'),
  DB_SSL: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .when('NODE_ENV', {
      is: 'production',
      then: Joi.valid(true).messages({
        'any.only': 'DB_SSL must be true in production for Neon connections.',
      }),
      otherwise: Joi.boolean().default(false),
    }),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean()
    .truthy('true')
    .falsy('false')
    .default(false),
  PGSSLMODE: Joi.string()
    .valid('disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full')
    .optional(),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .optional(),
  DB_SYNCHRONIZE: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_LOGGING: Joi.boolean().truthy('true').falsy('false').default(false),

  JWT_ACCESS_TOKEN_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .min(32)
      .invalid(defaultAccessSecret)
      .messages({
        'any.invalid':
          'JWT_ACCESS_TOKEN_SECRET must not use the default placeholder in production.',
      })
      .required(),
    otherwise: Joi.string().min(16).default(defaultAccessSecret),
  }),
  JWT_ACCESS_TOKEN_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_TOKEN_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string()
      .min(32)
      .invalid(defaultRefreshSecret)
      .messages({
        'any.invalid':
          'JWT_REFRESH_TOKEN_SECRET must not use the default placeholder in production.',
      })
      .required(),
    otherwise: Joi.string().min(16).default(defaultRefreshSecret),
  }),
  JWT_REFRESH_TOKEN_EXPIRES_IN: Joi.string().default('7d'),
  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).default(12),

  /** HMAC key for storing opaque refresh + password-reset token fingerprints (min 32 chars in prod). */
  AUTH_OPAQUE_TOKEN_PEPPER: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string().min(8).default('dev-opaque-token-pepper'),
  }),

  MFA_CODE_TTL_SECONDS: Joi.number().integer().min(60).default(600),
  PASSWORD_RESET_TTL_SECONDS: Joi.number().integer().min(300).default(3600),
  /** Base URL for building password reset links, e.g. `https://app.example.com` */
  FRONTEND_APP_BASE_URL: Joi.string().default('http://localhost:3001'),
  /** Path appended to base; reset link: `${FRONTEND_APP_BASE_URL}${PASSWORD_RESET_PATH}?token=...` */
  PASSWORD_RESET_PATH: Joi.string().default('/auth/reset-password'),

  /** Optional until messaging milestones (SendGrid). */
  SENDGRID_API_KEY: Joi.string().allow('').optional(),
  EMAIL_FROM: Joi.string().allow('').optional(),
  REG_VERIFICATION_CODE_TTL_SECONDS: Joi.number()
    .integer()
    .min(120)
    .default(600),
  REG_VERIFICATION_MAX_ATTEMPTS: Joi.number().integer().min(1).default(5),
  REG_VERIFICATION_MAX_RESENDS: Joi.number().integer().min(0).default(3),
  REG_VERIFICATION_RESEND_COOLDOWN_SECONDS: Joi.number()
    .integer()
    .min(10)
    .default(60),
  /** Optional until SMS milestones (Twilio). */
  TWILIO_ACCOUNT_SID: Joi.string().allow('').optional(),
  TWILIO_AUTH_TOKEN: Joi.string().allow('').optional(),
  TWILIO_FROM_NUMBER: Joi.string().allow('').optional(),
}).unknown(true);
