import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Not, Repository } from 'typeorm';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { Recipient } from './entities/recipient.entity';

@Injectable()
export class RecipientsRepository {
  constructor(
    @InjectRepository(Recipient)
    private readonly repo: Repository<Recipient>,
  ) {}

  async save(entity: Recipient): Promise<Recipient> {
    return this.repo.save(entity);
  }

  async findActiveById(id: string): Promise<Recipient | null> {
    return this.repo.findOne({ where: { id, isActive: true } });
  }

  /**
   * Active recipient whose verification is not terminal-negative for receiving funds.
   */
  async findEligibleForTransactionById(id: string): Promise<Recipient | null> {
    return this.repo.findOne({
      where: {
        id,
        isActive: true,
        verificationStatus: Not(
          In([VerificationStatus.FAILED, VerificationStatus.EXPIRED]),
        ),
      },
    });
  }

  /**
   * Active recipients only; matches name or normalized phone (partial, case-insensitive for names).
   */
  async searchActiveByQuery(
    rawQuery: string,
    limit: number,
  ): Promise<Recipient[]> {
    const q = rawQuery.trim();
    const escaped = q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
    const pattern = `%${escaped}%`;

    return this.repo
      .createQueryBuilder('r')
      .where('r.is_active = true')
      .andWhere(
        new Brackets((qb) => {
          qb.where('r.first_name ILIKE :pattern ESCAPE \'\\\'', { pattern })
            .orWhere('r.last_name ILIKE :pattern ESCAPE \'\\\'', { pattern })
            .orWhere('r.normalized_phone ILIKE :pattern ESCAPE \'\\\'', {
              pattern,
            });
        }),
      )
      .orderBy('r.updated_at', 'DESC')
      .take(limit)
      .getMany();
  }
}
