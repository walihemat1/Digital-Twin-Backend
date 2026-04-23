import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import authConfig from '../../config/auth.config';
import { UsersModule } from '../users/users.module';
import { RegistrationController } from './controllers/registration.controller';
import { RegistrationSession } from './entities/registration-session.entity';
import { RegistrationService } from './registration/registration.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>): JwtModuleOptions =>
        ({
          secret: config.accessTokenSecret,
          signOptions: {
            expiresIn: config.accessTokenExpiresIn,
          },
        }) as JwtModuleOptions,
    }),
    UsersModule,
    TypeOrmModule.forFeature([RegistrationSession]),
  ],
  controllers: [RegistrationController],
  providers: [JwtStrategy, RegistrationService],
  exports: [PassportModule, JwtModule],
})
export class AuthModule {}
