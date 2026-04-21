import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService); // this is used to get the config service instance. ConfigService is a class that provides access to the configuration values from the .env file.
  const apiPrefix = configService.get<string>('app.apiPrefix') ?? 'api';
  const port = configService.get<number>('app.port') ?? 3000;

  app.setGlobalPrefix(apiPrefix); // this is used to set the global prefix for the API meaning all the routes will be prefixed with the apiPrefix. In our case it will be /api.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // this is used to strip out any properties that are not in the DTO
      transform: true, // this is used to transform the data to the DTO type e.g. string to number
      forbidNonWhitelisted: true, // this is used to throw an error if any properties are not in the DTO
    }),
  );

  await app.listen(port);
}

void bootstrap();
