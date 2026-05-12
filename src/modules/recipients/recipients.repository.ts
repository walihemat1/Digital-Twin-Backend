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

  async findActiveByNormalizedPhone(
    normalizedPhone: string,
  ): Promise<Recipient | null> {
    return this.repo.findOne({
      where: { normalizedPhone, isActive: true },
    });
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
   * Active recipients only; matches name, phone, or email (partial, case-insensitive for text fields).
   */
  async searchActiveByQueryPaged(
    rawQuery: string,
    limit: number,
    page: number,
  ): Promise<{ items: Recipient[]; total: number }> {
    const q = rawQuery.trim();
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * limit;

    let base = this.repo.createQueryBuilder('r').where('r.is_active = true');

    if (q.length >= 2) {
      const escaped = q
        .replace(/\\/g, '\\\\')
        .replace(/%/g, '\\%')
        .replace(/_/g, '\\_');
      const pattern = `%${escaped}%`;
      base = base.andWhere(
        new Brackets((qb) => {
          qb.where('r.first_name ILIKE :pattern ESCAPE \'\\\'', { pattern })
            .orWhere('r.last_name ILIKE :pattern ESCAPE \'\\\'', { pattern })
            .orWhere('r.normalized_phone ILIKE :pattern ESCAPE \'\\\'', {
              pattern,
            })
            .orWhere('r.email ILIKE :pattern ESCAPE \'\\\'', { pattern })
            .orWhere('r.whatsapp_number ILIKE :pattern ESCAPE \'\\\'', {
              pattern,
            });
        }),
      );
    }

    const total = await base.clone().getCount();
    const items = await base
      .orderBy('r.updated_at', 'DESC')
      .skip(offset)
      .take(limit)
      .getMany();

    return { items, total };
  }
}
