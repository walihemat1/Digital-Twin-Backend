import 'dotenv/config';
import { DataSource } from 'typeorm';

const databaseUrl = process.env.DATABASE_URL;
const isSslEnabled = (process.env.DB_SSL ?? 'false') === 'true';
const isSslRejectUnauthorized =
  (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? 'false') === 'true';
const isSynchronizeEnabled = (process.env.DB_SYNCHRONIZE ?? 'false') === 'true';
const isLoggingEnabled = (process.env.DB_LOGGING ?? 'false') === 'true';
const sslConfig =
  databaseUrl || isSslEnabled
    ? { rejectUnauthorized: isSslRejectUnauthorized }
    : false;

export default new DataSource({
  type: 'postgres',
  url: databaseUrl,
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'digital_twin',
  schema: process.env.DB_SCHEMA ?? 'public',
  ssl: sslConfig,
  synchronize: isSynchronizeEnabled,
  logging: isLoggingEnabled,
  entities: ['src/**/*.entity.ts', 'dist/**/*.entity.js'],
  // CLI runs from repo root with ts-node; listing dist/*.js too duplicates classes when a build exists.
  migrations: ['src/database/migrations/*.ts'],
  migrationsTransactionMode: 'none',
});
