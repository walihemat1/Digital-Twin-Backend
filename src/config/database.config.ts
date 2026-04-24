import { registerAs } from '@nestjs/config';

const isSslEnabled = (process.env.DB_SSL ?? 'false') === 'true';
const isSslRejectUnauthorized =
  (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? 'true') === 'true';
const isSynchronizeEnabled = (process.env.DB_SYNCHRONIZE ?? 'false') === 'true';
const isLoggingEnabled = (process.env.DB_LOGGING ?? 'false') === 'true';

export default registerAs('database', () => ({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  name: process.env.DB_NAME ?? 'digital_twin',
  schema: process.env.DB_SCHEMA ?? 'public',
  ssl: isSslEnabled ? { rejectUnauthorized: isSslRejectUnauthorized } : false,
  synchronize: isSynchronizeEnabled,
  logging: isLoggingEnabled,
}));
