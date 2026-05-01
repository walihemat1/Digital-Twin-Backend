import { Module } from '@nestjs/common';
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import authConfig from '../../config/auth.config';
import { UsersModule } from '../users/users.module';
import { AuthSessionController } from './controllers/auth-session.controller';
import { RegistrationController } from './controllers/registration.controller';
import { MfaChallenge } from './entities/mfa-challenge.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { RegistrationSession } from './entities/registration-session.entity';
import { SendgridEmailService } from './email/sendgrid-email.service';
import { RegistrationService } from './registration/registration.service';
import { AuthLoginService } from './services/auth-login.service';
import { AuthTokensService } from './services/auth-tokens.service';
import { MfaChallengeService } from './services/mfa-challenge.service';
import { PasswordRecoveryService } from './services/password-recovery.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { User } from '../users/entities/user.entity';
import { UserProfile } from '../users/entities/user-profile.entity';
import { RegistrationVerificationCode } from './entities/registration-verification-code.entity';
import { RegistrationVerificationService } from './registration/registration-verification.service';
import { TwilioWhatsappService } from './registration/twilio-whatsapp.service';

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
    TypeOrmModule.forFeature([
      RegistrationSession,
      RegistrationVerificationCode,
      User,
      UserProfile,
      MfaChallenge,
      PasswordResetToken,
      RefreshToken,
    ]),
  ],
  controllers: [RegistrationController, AuthSessionController],
  providers: [
    JwtStrategy,
    RegistrationService,
    RegistrationVerificationService,
    TwilioWhatsappService,
    SendgridEmailService,
    AuthLoginService,
    MfaChallengeService,
    AuthTokensService,
    PasswordRecoveryService,
  ],
  exports: [PassportModule, JwtModule, AuthTokensService, SendgridEmailService],
})
export class AuthModule {}
