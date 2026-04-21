/**
 * This module sets up the database connectivity for the application using TypeORM and dynamic configuration.
 * It leverages NestJS's dependency injection and configuration system for flexible and environment-driven setup.
 *
 * Key responsibilities of this file:
 * - Import TypeORM's module asynchronously, using configuration values loaded at runtime.
 * - Ensure all database settings (host, port, username, password, database name, schema, SSL options, etc.)
 *   are supplied via the ConfigModule and .env variables, making it easy to change environment without code changes.
 * - Export DatabaseModule, enabling other parts of the app to import and use the centralized TypeORM connection.
 *
 * Each line is commented below for clarity.
 */

import { Module } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import databaseConfig from '../config/database.config';
import { createTypeOrmOptions } from './typeorm-options.factory';

@Module({
  // Decorator that defines a NestJS module for database connectivity
  imports: [
    // Specifies the modules to import into this module
    TypeOrmModule.forRootAsync({
      // Configures the TypeORM module with asynchronous (dynamic) options
      inject: [databaseConfig.KEY], // Injects the database config using its unique config key
      useFactory: (db: ConfigType<typeof databaseConfig>) =>
        // Defines a factory function that receives the database config object
        createTypeOrmOptions(db), // Uses the config to create and return TypeORM connection options
    }),
  ],
})
export class DatabaseModule {} // Exports the DatabaseModule for use in other modules
