import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USERNAME ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  name: process.env.DB_NAME ?? 'digital_twin',
  schema: process.env.DB_SCHEMA ?? 'public', // this is used to get the schema from the .env file. If not found, it will default to public. This is the default schema for the database.
  ssl: (process.env.DB_SSL ?? 'false') === 'true', // this is used to get the ssl from the .env file. If not found, it will default to false. This is used to determine if the database connection should be encrypted.
  synchronize: (process.env.DB_SYNCHRONIZE ?? 'false') === 'true', // this is used to get the synchronize from the .env file. If not found, it will default to false. This is used to determine if the database schema should be synchronized with the database. This is used to automatically synchronize the database schema with the database. Synchronization is the process of creating the database schema in the database.
  logging: (process.env.DB_LOGGING ?? 'false') === 'true', // this is used to get the logging from the .env file. If not found, it will default to false. This is used to determine if the database logs should be logged. This is used to log the database queries and other database activity.
}));
