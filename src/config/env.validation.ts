// this is the validation schema for the environment variables. It is used to validate the environment variables before the application starts. Always remember to import this file in the app.module.ts file e.g (import { envValidationSchema } from './config/env.validation';). And also remember to add the validation schema to the .env file (e.g. NODE_ENV=development). validation schema is the schema that is used to validate the environment variables.

import Joi from 'joi'; // Joi is a library that is used to validate the environment variables.

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'), // this is used to validate the node environment. It can be development, test, or production. If not found, it will default to development.
  PORT: Joi.number().port().default(3000), // this is used to validate the port. It can be a number. If not found, it will default to 3000.
  API_PREFIX: Joi.string().default('api'), // this is used to validate the api prefix. It can be a string. If not found, it will default to api.
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

  JWT_ACCESS_TOKEN_SECRET: Joi.string()
    .min(16)
    .default('change-this-access-secret'),
  JWT_ACCESS_TOKEN_EXPIRES_IN: Joi.string().default('15m'),
  JWT_REFRESH_TOKEN_SECRET: Joi.string()
    .min(16)
    .default('change-this-refresh-secret'),
  JWT_REFRESH_TOKEN_EXPIRES_IN: Joi.string().default('7d'),
  BCRYPT_SALT_ROUNDS: Joi.number().integer().min(10).default(12),
});
