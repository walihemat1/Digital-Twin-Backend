import appConfig from './app.config';
import authConfig from './auth.config';
import databaseConfig from './database.config';

/**
 * Single entry for Nest `ConfigModule.forRoot({ load: [...] })`.
 * Add new `registerAs` namespaces here to keep `AppModule` stable.
 */
export const configLoaders = [appConfig, authConfig, databaseConfig] as const;

export { default as appConfig } from './app.config';
export { default as authConfig } from './auth.config';
export { default as databaseConfig } from './database.config';
