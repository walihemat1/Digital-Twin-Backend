import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  async getDbVersion() {
    try {
      return await this.appService.getDbVersion();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected error';
      throw new InternalServerErrorException(message);
    }
  }
}
