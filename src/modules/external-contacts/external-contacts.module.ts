import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExternalContact } from './entities/external-contact.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ExternalContact])],
  exports: [TypeOrmModule],
})
export class ExternalContactsModule {}
