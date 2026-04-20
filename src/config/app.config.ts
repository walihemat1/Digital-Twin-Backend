// this is the configuration for the app module. It is used to store the configuration values for the app module. The app module is the main module of the application which is responsible for the overall application and all the modules are imported here. Always remember to import this file in the app.module.ts file e.g (import appConfig from './config/app.config';). And also remember to add the configuration values to the .env file.
import { registerAs } from '@nestjs/config'; // this is used to register the configuration values for the app module. registerAs is a function that takes a name and a function that returns the configuration values.

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development', // this is used to get the node environment from the .env file. If not found, it will default to development.
  port: Number(process.env.PORT ?? 3000), // this is used to get the port from the .env file. If not found, it will default to 3000.
  apiPrefix: process.env.API_PREFIX ?? 'api', // this is used to get the api prefix from the .env file. If not found, it will default to api.
  serviceName: process.env.SERVICE_NAME ?? 'digital-twin-backend', // this is used to get the service name from the .env file. If not found, it will default to digital-twin-backend.
}));
