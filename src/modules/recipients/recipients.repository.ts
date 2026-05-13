import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { RecipientUserAccess } from './entities/recipient-user-access.entity';
import { Recipient } from './entities/recipient.entity';

export type RecipientSearchVisibility =
  | { mode: 'admin' }
  | { mode: 'user'; userId: string };

@Injectable()
export class RecipientsRepository {
  constructor(
    @InjectRepository(Recipient)
    private readonly repo: Repository<Recipient>,
    @InjectRepository(RecipientUserAccess)
    private readonly accessRepo: Repository<RecipientUserAccess>,
  ) {}

  private quotedAccessTable(): string {
    const schema =
      (this.repo.manager.connection.options as { schema?: string }).schema ??
      'public';
    return `"${schema}"."recipient_user_access"`;
  }

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
   * Whether the coordinator/sender may see or select this recipient (creator or explicit access row).
   */
  async isRecipientVisibleToCoordinatorUser(
    recipientId: string,
    userId: string,
  ): Promise<boolean> {
    const accessTable = this.quotedAccessTable();
    const row = await this.repo
      .createQueryBuilder('r')
      .select('r.id')
      .where('r.id = :recipientId', { recipientId })
      .andWhere(
        new Brackets((qb) => {
          qb.where('r.created_by_user_id = :userId', { userId }).orWhere(
            `EXISTS (SELECT 1 FROM ${accessTable} rua WHERE rua.recipient_id = r.id AND rua.user_id = :userId)`,
          );
        }),
      )
      .getOne();
    return row != null;
  }

  async grantCoordinatorAccess(
    recipientId: string,
    userId: string,
  ): Promise<void> {
    await this.accessRepo
      .createQueryBuilder()
      .insert()
      .into(RecipientUserAccess)
      .values({ recipientId, userId })
      .orIgnore()
      .execute();
  }

  /**
   * Active recipient whose verification is not terminal-negative for receiving funds,
   * and visible to the given coordinator/sender (or any recipient when {@link RecipientSearchVisibility.mode} is `admin`).
   */
  async findEligibleForTransactionForUser(
    id: string,
    visibility: RecipientSearchVisibility,
  ): Promise<Recipient | null> {
    const accessTable = this.quotedAccessTable();
    const qb = this.repo
      .createQueryBuilder('r')
      .where('r.id = :id', { id })
      .andWhere('r.is_active = true')
      .andWhere('r.verification_status NOT IN (:...badStatuses)', {
        badStatuses: [VerificationStatus.FAILED, VerificationStatus.EXPIRED],
      });

    if (visibility.mode === 'user') {
      const userId = visibility.userId;
      qb.andWhere(
        new Brackets((sub) => {
          sub
            .where('r.created_by_user_id = :userId', { userId })
            .orWhere(
              `EXISTS (SELECT 1 FROM ${accessTable} rua WHERE rua.recipient_id = r.id AND rua.user_id = :userId)`,
            );
        }),
      );
    }

    return qb.getOne();
  }

  /**
   * Active recipients only; matches name, phone, or email (partial, case-insensitive for text fields).
   * Coordinators/senders only see recipients they created or that were explicitly shared (access rows).
   * Admins see all active recipients.
   */
  async searchActiveByQueryPaged(
    rawQuery: string,
    limit: number,
    page: number,
    visibility: RecipientSearchVisibility,
  ): Promise<{ items: Recipient[]; total: number }> {
    const q = rawQuery.trim();
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * limit;
    const accessTable = this.quotedAccessTable();

    let base = this.repo.createQueryBuilder('r').where('r.is_active = true');

    if (visibility.mode === 'user') {
      const userId = visibility.userId;
      base = base.andWhere(
        new Brackets((sub) => {
          sub
            .where('r.created_by_user_id = :userId', { userId })
            .orWhere(
              `EXISTS (SELECT 1 FROM ${accessTable} rua WHERE rua.recipient_id = r.id AND rua.user_id = :userId)`,
            );
        }),
      );
    }

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
