import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MeController } from './controllers/me.controller';
import { UserProfile } from './entities/user-profile.entity';
import { User } from './entities/user.entity';

@Module({
  imports: [TypeOrmModule.forFeature([User, UserProfile])],
  controllers: [MeController],
  exports: [TypeOrmModule],
})
export class UsersModule {}
