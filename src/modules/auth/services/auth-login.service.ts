import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AccountStatus } from '../../../common/enums/account-status.enum';
import { normalizeEmail } from '../../../common/utils/normalization.util';
import { User } from '../../users/entities/user.entity';
import { LoginDto } from '../dto/login.dto';
import { MfaChallengeService } from './mfa-challenge.service';

@Injectable()
export class AuthLoginService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly mfa: MfaChallengeService,
  ) {}

  async login(dto: LoginDto) {
    const email = normalizeEmail(dto.email);
    const user = await this.users.findOne({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const passwordOk = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordOk) {
      user.failedAttemptCount = (user.failedAttemptCount ?? 0) + 1;
      await this.users.save(user);
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.accountStatus !== AccountStatus.ACTIVE) {
      throw this.forbiddenForStatus(user.accountStatus);
    }

    return this.mfa.startLoginMfa(user);
  }

  private forbiddenForStatus(status: AccountStatus): ForbiddenException {
    const messages: Partial<Record<AccountStatus, string>> = {
      [AccountStatus.PENDING_REGISTRATION]:
        'Your account is not complete yet. Finish registration to continue.',
      [AccountStatus.PENDING_APPROVAL]:
        'Your account is waiting for admin approval before you can sign in.',
      [AccountStatus.SUSPENDED]: 'This account is suspended. Contact support.',
      [AccountStatus.REJECTED]:
        'This account was rejected. Contact support if you believe this is an error.',
      [AccountStatus.DISABLED]: 'This account is disabled. Contact support.',
    };
    return new ForbiddenException(
      messages[status] ?? 'You are not allowed to sign in with this account.',
    );
  }
}
