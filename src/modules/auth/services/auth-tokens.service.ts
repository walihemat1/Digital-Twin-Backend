import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ConfigType } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountStatus } from '../../../common/enums/account-status.enum';
import { User } from '../../users/entities/user.entity';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { RefreshToken } from '../entities/refresh-token.entity';
import authConfig from '../../../config/auth.config';
import {
  generateUrlSafeToken,
  hashOpaqueToken,
} from '../crypto/opaque-token.util';
import { TokenPairDto } from '../dto/token-pair.dto';

@Injectable()
export class AuthTokensService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refresh: Repository<RefreshToken>,
    private readonly jwt: JwtService,
    @Inject(authConfig.KEY)
    private readonly auth: ConfigType<typeof authConfig>,
  ) {}

  private refreshExpiresAt(): Date {
    const s = this.parseDurationToSeconds(this.auth.refreshTokenExpiresIn);
    return new Date(Date.now() + s * 1000);
  }

  private parseDurationToSeconds(expr: string): number {
    const m = String(expr)
      .trim()
      .match(/^(\d+)([smhd])$/i);
    if (m) {
      const n = Number(m[1]);
      const u = m[2].toLowerCase();
      const mult = u === 's' ? 1 : u === 'm' ? 60 : u === 'h' ? 3600 : 86400;
      return n * mult;
    }
    const n = Number(expr);
    if (!Number.isNaN(n)) {
      return n;
    }
    return 7 * 24 * 3600;
  }

  buildAccessToken(user: User): string {
    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active.');
    }
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      tokenType: 'access',
    };
    return this.jwt.sign(payload, {
      secret: this.auth.accessTokenSecret,
      expiresIn: this.auth.accessTokenExpiresIn,
      // String TTL from env; satisfies jsonwebtoken SignOptions when typed strictly.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  }

  async buildTokenPair(user: User): Promise<TokenPairDto> {
    const accessToken = this.buildAccessToken(user);
    const raw = generateUrlSafeToken(32);
    const tokenHash = hashOpaqueToken(raw, this.auth.opaqueTokenPepper);
    const now = new Date();
    const expires = this.refreshExpiresAt();
    await this.refresh.save(
      this.refresh.create({
        userId: user.id,
        tokenHash,
        issuedAt: now,
        expiresAt: expires,
        revokedAt: null,
      }),
    );
    return { accessToken, refreshToken: raw };
  }

  async refreshSession(rawRefresh: string): Promise<TokenPairDto> {
    const tokenHash = hashOpaqueToken(rawRefresh, this.auth.opaqueTokenPepper);
    const row = await this.refresh.findOne({ where: { tokenHash } });
    const now = new Date();
    if (
      !row ||
      row.revokedAt !== null ||
      row.expiresAt.getTime() <= now.getTime()
    ) {
      throw new UnauthorizedException('Invalid or expired refresh session.');
    }
    const user = await this.refresh.manager.getRepository(User).findOne({
      where: { id: row.userId },
    });
    if (!user) {
      throw new UnauthorizedException('User no longer exists.');
    }
    if (user.accountStatus !== AccountStatus.ACTIVE) {
      row.revokedAt = now;
      await this.refresh.save(row);
      throw new UnauthorizedException(
        'Session is no longer valid for this account.',
      );
    }
    row.revokedAt = now;
    await this.refresh.save(row);
    return this.buildTokenPair(user);
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.refresh
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revokedAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('revoked_at IS NULL')
      .execute();
  }
}
