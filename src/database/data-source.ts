/**
 * This file defines and exports a TypeORM DataSource instance configured for use with PostgreSQL.
 *
 * Purpose:
 * - Provides a configured DataSource that can be used across the project for database operations, CLI migrations, and TypeORM tooling.
 * - Loads connection settings such as host, port, username, password, database name, schema, and SSL usage from environment variables.
 * - Specifies the locations for ORM entities and migration scripts for both TypeScript and compiled JavaScript.
 *
 * Usage:
 * - This DataSource is commonly imported for TypeORM CLI commands (like running migrations or generating them).
 * - Ensures that configuration remains consistent with application settings (.env variables).
 *
 * Note:
 * - This file is separate from NestJS's module-based connection setup, making it flexible for standalone and CLI utilities.
 */
//

/**
 * Differences between @Digital-Twin-Backend/src/database/data-source.ts and @Digital-Twin-Backend/src/config/database.config.ts:
 *
 * 1. Purpose and Usage:
 *    - data-source.ts: Defines and exports a TypeORM DataSource instance for Node/TypeORM CLI/database tooling. It pulls configuration directly from environment variables (process.env).
 *    - database.config.ts: Exports a NestJS configuration factory (using registerAs) that maps environment variables into a structured config object, for use in dependency-injected application contexts, notably within NestJS modules.
 *
 * 2. Output/Export:
 *    - data-source.ts: Exports a DataSource instance that is ready for immediate use by TypeORM or tooling.
 *    - database.config.ts: Exports a config registration function consumed by NestJS’s ConfigModule.
 *
 * 3. Configuration Details:
 *    - data-source.ts: Contains direct TypeORM DataSource config, including fixed settings for synchronize and logging (both set to false) and paths for entities/migrations.
 *    - database.config.ts: Maps .env variables to an object, with application-centric names (e.g., name for database name), but does not itself provide TypeORM options or paths.
 *
 * 4. Environment Variable Mapping:
 *    - Both files map environment variables, but data-source.ts does so for immediate use, while database.config.ts does so for later consumption by the app.
 *
 * 5. Intended Consumers:
 *    - data-source.ts: For CLI/migration scripts—standalone or external usage.
 *    - database.config.ts: For NestJS's dependency injection, passed to modules/services.
 *
 * 6. Entities and Migrations:
 *    - Only data-source.ts declares explicit file globs for locating entities and migrations.
 *
 * 7. SSL Handling:
 *    - Both use (process.env.DB_SSL ?? 'false') === 'true' to determine SSL, though config.ts outputs this as a Boolean, whereas data-source.ts uses it immediately.
 *
 * In summary: data-source.ts is a direct TypeORM config/entry point for tools and scripts; database.config.ts is an app-structured setting for use within NestJS’s configuration system.
 */

import 'dotenv/config';
import { DataSource } from 'typeorm';

const isSslEnabled = (process.env.DB_SSL ?? 'false') === 'true';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'digital_twin',
  schema: process.env.DB_SCHEMA ?? 'public',
  ssl: isSslEnabled ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging: false,
  entities: ['src/**/*.entity.ts', 'dist/**/*.entity.js'],
  migrations: ['src/database/migrations/*.ts', 'dist/database/migrations/*.js'],
});
