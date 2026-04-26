import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap/configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: 'http://localhost:5173' });
  configureApp(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('app.port') ?? 3000;

  await app.listen(port);
}

void bootstrap();
