import Joi from 'joi';

const defaultAccessSecret = 'change-this-access-secret';
const defaultRefreshSecret = 'change-this-refresh-secret';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_PREFIX: Joi.string().default('api'),
  SERVICE_NAME: Joi.string().default('digital-twin-backend'),

  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_USERNAME: Joi.string().default('postgres'),
  DB_PASSWORD: Joi.string().allow('').default('postgres'),
  DB_NAME: Joi.string().default('digital_twin'),
  DB_SCHEMA: Joi.string().default('public'),
  DB_SSL: Joi.boolean().truthy('true').falsy('false').default(false),
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

  /** Optional until messaging milestones (SendGrid). */
  SENDGRID_API_KEY: Joi.string().allow('').optional(),
  EMAIL_FROM: Joi.string().allow('').optional(),
  /** Optional until SMS milestones (Twilio). */
  TWILIO_ACCOUNT_SID: Joi.string().allow('').optional(),
  TWILIO_AUTH_TOKEN: Joi.string().allow('').optional(),
  TWILIO_FROM_NUMBER: Joi.string().allow('').optional(),
}).unknown(true);
