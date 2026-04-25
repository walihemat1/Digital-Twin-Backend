import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { Pool } from 'pg';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from '../config/database.config';
import { createTypeOrmOptions } from './typeorm-options.factory';

const isSslEnabled = (process.env.DB_SSL ?? 'false') === 'true';
const isSslRejectUnauthorized =
  (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? 'false') === 'true';

const buildConnectionString = (): string => {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.DB_HOST ?? 'localhost';
  const port = process.env.DB_PORT ?? '5432';
  const username = encodeURIComponent(process.env.DB_USERNAME ?? 'postgres');
  const password = encodeURIComponent(process.env.DB_PASSWORD ?? 'postgres');
  const database = process.env.DB_NAME ?? 'digital_twin';
  const sslMode = isSslEnabled ? 'require' : 'disable';

  return `postgresql://${username}:${password}@${host}:${port}/${database}?sslmode=${sslMode}`;
};

// Dedicated Neon connection provider for direct SQL access when needed.
const connectionString = buildConnectionString();

const neonConnectionProvider = {
  provide: 'NEON_CONNECTION',
  useValue: new Pool({
    connectionString,
    ssl: connectionString
      ? { rejectUnauthorized: isSslRejectUnauthorized }
      : isSslEnabled
        ? { rejectUnauthorized: isSslRejectUnauthorized }
        : false,
  }),
};

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [databaseConfig.KEY],
      useFactory: (db: ConfigType<typeof databaseConfig>) => createTypeOrmOptions(db),
    }),
  ],
  providers: [neonConnectionProvider],
  exports: [neonConnectionProvider],
})
export class DatabaseModule {}
