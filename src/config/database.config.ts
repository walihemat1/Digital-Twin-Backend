import { registerAs } from '@nestjs/config';

const databaseUrl = process.env.DATABASE_URL;
const dbHost = process.env.DB_HOST ?? 'localhost';
const isSslEnvEnabled = (process.env.DB_SSL ?? 'false') === 'true';
const isSslRejectUnauthorized =
  (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? 'true') === 'true';
const isSynchronizeEnabled = (process.env.DB_SYNCHRONIZE ?? 'false') === 'true';
const isLoggingEnabled = (process.env.DB_LOGGING ?? 'false') === 'true';

const hostLooksLikeNeon = dbHost.endsWith('.neon.tech');
const shouldEnableSsl = isSslEnvEnabled || Boolean(databaseUrl) || hostLooksLikeNeon;

export default registerAs('database', () => ({
  type: 'postgres',
  host: dbHost,
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  name: process.env.DB_NAME ?? 'digital_twin',
  schema: process.env.DB_SCHEMA ?? 'public',
  ssl: shouldEnableSsl
    ? { rejectUnauthorized: isSslRejectUnauthorized }
    : false,
  synchronize: isSynchronizeEnabled,
  logging: isLoggingEnabled,
}));
