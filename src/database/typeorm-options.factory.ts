// This file defines a factory function that generates TypeORM options for establishing a PostgreSQL database connection based on configuration values.
// Typically, you should import and use this factory in the AppModule (e.g., import { createTypeOrmOptions } from './database/typeorm-options.factory';).
// Ensure that all relevant database settings are provided in the .env file or environment variables.

import { ConfigType } from '@nestjs/config'; // ConfigType is a type that is used to get the configuration values from the config module.
import { TypeOrmModuleOptions } from '@nestjs/typeorm'; // TypeOrmModuleOptions is a type that is used to create the typeorm options for the database connection.
import databaseConfig from '../config/database.config'; // databaseConfig is the configuration for the database.

export const createTypeOrmOptions = (
  db: ConfigType<typeof databaseConfig>, // db is the configuration for the database.
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: db.host,
  port: db.port,
  username: db.username,
  password: db.password,
  database: db.name,
  schema: db.schema,
  ssl: db.ssl,
  synchronize: db.synchronize,
  logging: db.logging,
  autoLoadEntities: true, // Automatically registers all entities so you don't have to specify them manually in the options.
  migrationsRun: false, // If true, runs pending migrations automatically when the application starts. Set to false here for explicit migration control.
  retryAttempts: process.env.NODE_ENV === 'test' ? 2 : 10,
  retryDelay: process.env.NODE_ENV === 'test' ? 500 : 3000,

  // The following option specifies the location of migration files for database schema changes.
  // These migration files allow you to version, update, and maintain your database schema in a controlled manner.
  // TypeORM will know where to find migration scripts that should be run (or were run) for database versioning.
  migrations: ['dist/database/migrations/*.js'],
});
