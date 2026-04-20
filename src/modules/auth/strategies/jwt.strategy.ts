import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthenticatedUser } from '../../../common/interfaces/authenticated-user.interface';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

// This code defines the JwtStrategy class, which implements JWT authentication for the application.
// It extracts and validates JWTs from HTTP requests, verifies them using a configured secret,
// and converts the token's payload into the application's AuthenticatedUser format.
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('auth.accessTokenSecret') ??
        'change-this-access-secret',
    });
  }

  validate(payload: JwtPayload): AuthenticatedUser {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
    };
  }
}

/**
 * --------------------------------------------------------------------------
 * Purpose of this File (`jwt.strategy.ts`)
 * --------------------------------------------------------------------------
 *
 * This file defines the JWT authentication strategy for the application using
 * Passport.js and the NestJS framework.
 *
 * Why we need it:
 * - Provides a standardized method to validate and parse JWTs (JSON Web Tokens) sent in HTTP requests.
 * - Ensures that only authenticated users with valid tokens can access protected endpoints.
 * - Extracts and transforms the token payload into the application's AuthenticatedUser object.
 * - Integrates with the application's configuration for token secrets and options.
 * - Centralizes JWT-related business logic in one, easily maintainable location.
 */
