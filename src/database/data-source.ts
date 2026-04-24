import 'dotenv/config';
import { DataSource } from 'typeorm';

const isSslEnabled = (process.env.DB_SSL ?? 'false') === 'true';
const isSynchronizeEnabled = (process.env.DB_SYNCHRONIZE ?? 'false') === 'true';
const isLoggingEnabled = (process.env.DB_LOGGING ?? 'false') === 'true';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'digital_twin',
  schema: process.env.DB_SCHEMA ?? 'public',
  ssl: isSslEnabled ? { rejectUnauthorized: false } : false,
  synchronize: isSynchronizeEnabled,
  logging: isLoggingEnabled,
  entities: ['src/**/*.entity.ts', 'dist/**/*.entity.js'],
  migrations: ['src/database/migrations/*.ts', 'dist/database/migrations/*.js'],
});
