import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { Transaction } from '../transactions/entities/transaction.entity';
import { RecipientUserAccess } from './entities/recipient-user-access.entity';
import { Recipient } from './entities/recipient.entity';

export type RecipientSearchVisibility =
  | { mode: 'admin' }
  | { mode: 'user'; userId: string };

export type RecipientListStatusFilter = 'active' | 'inactive' | 'all';

export type RecipientListSort = {
  sortBy: 'updated_at' | 'created_at' | 'last_name' | 'first_name' | 'email';
  sortDir: 'ASC' | 'DESC';
};

@Injectable()
export class RecipientsRepository {
  constructor(
    @InjectRepository(Recipient)
    private readonly repo: Repository<Recipient>,
    @InjectRepository(RecipientUserAccess)
    private readonly accessRepo: Repository<RecipientUserAccess>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
  ) {}

  private quotedAccessTable(): string {
    const schema =
      (this.repo.manager.connection.options as { schema?: string }).schema ??
      'public';
    return `"${schema}"."recipient_user_access"`;
  }

  private applyVisibility(
    qb: ReturnType<Repository<Recipient>['createQueryBuilder']>,
    visibility: RecipientSearchVisibility,
  ): void {
    if (visibility.mode !== 'user') return;
    const accessTable = this.quotedAccessTable();
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

  async save(entity: Recipient): Promise<Recipient> {
    return this.repo.save(entity);
  }

  async remove(entity: Recipient): Promise<void> {
    await this.repo.remove(entity);
  }

  async findById(id: string): Promise<Recipient | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findActiveById(id: string): Promise<Recipient | null> {
    return this.repo.findOne({ where: { id, isActive: true } });
  }

  async findByIdForUser(
    id: string,
    visibility: RecipientSearchVisibility,
  ): Promise<Recipient | null> {
    const qb = this.repo.createQueryBuilder('r').where('r.id = :id', { id });
    this.applyVisibility(qb, visibility);
    return qb.getOne();
  }

  async findActiveByNormalizedPhone(
    normalizedPhone: string,
    excludeRecipientId?: string,
  ): Promise<Recipient | null> {
    const qb = this.repo
      .createQueryBuilder('r')
      .where('r.normalized_phone = :normalizedPhone', { normalizedPhone })
      .andWhere('r.is_active = true');
    if (excludeRecipientId) {
      qb.andWhere('r.id != :excludeRecipientId', { excludeRecipientId });
    }
    return qb.getOne();
  }

  async findByNormalizedEmail(
    email: string,
    excludeRecipientId?: string,
  ): Promise<Recipient | null> {
    const normalized = email.trim().toLowerCase();
    if (!normalized) return null;
    const qb = this.repo
      .createQueryBuilder('r')
      .where('LOWER(TRIM(r.email)) = :normalized', { normalized });
    if (excludeRecipientId) {
      qb.andWhere('r.id != :excludeRecipientId', { excludeRecipientId });
    }
    return qb.getOne();
  }

  async findByIdentificationHash(
    hash: string,
    excludeRecipientId?: string,
  ): Promise<Recipient | null> {
    const qb = this.repo
      .createQueryBuilder('r')
      .where('r.identification_number_hash = :hash', { hash });
    if (excludeRecipientId) {
      qb.andWhere('r.id != :excludeRecipientId', { excludeRecipientId });
    }
    return qb.getOne();
  }

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

  async searchActiveByQueryPaged(
    rawQuery: string,
    limit: number,
    page: number,
    visibility: RecipientSearchVisibility,
  ): Promise<{ items: Recipient[]; total: number }> {
    return this.listByQueryPaged(rawQuery, limit, page, visibility, 'active', {
      sortBy: 'updated_at',
      sortDir: 'DESC',
    });
  }

  async listByQueryPaged(
    rawQuery: string,
    limit: number,
    page: number,
    visibility: RecipientSearchVisibility,
    statusFilter: RecipientListStatusFilter,
    sort: RecipientListSort,
  ): Promise<{ items: Recipient[]; total: number }> {
    const q = rawQuery.trim();
    const safePage = Math.max(page, 1);
    const offset = (safePage - 1) * limit;

    let base = this.repo.createQueryBuilder('r');
    this.applyVisibility(base, visibility);

    if (statusFilter === 'active') {
      base = base.andWhere('r.is_active = true');
    } else if (statusFilter === 'inactive') {
      base = base.andWhere('r.is_active = false');
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

    const sortColumn =
      sort.sortBy === 'email'
        ? 'r.email'
        : sort.sortBy === 'first_name'
          ? 'r.first_name'
          : sort.sortBy === 'last_name'
            ? 'r.last_name'
            : sort.sortBy === 'created_at'
              ? 'r.created_at'
              : 'r.updated_at';

    const total = await base.clone().getCount();
    const items = await base
      .orderBy(sortColumn, sort.sortDir)
      .addOrderBy('r.id', 'ASC')
      .skip(offset)
      .take(limit)
      .getMany();

    return { items, total };
  }

  async countTransactionsForRecipient(recipientId: string): Promise<number> {
    return this.transactions.count({ where: { recipientId } });
  }

  async listTransactionsForRecipient(
    recipientId: string,
    visibility: RecipientSearchVisibility,
    limit = 50,
  ): Promise<Transaction[]> {
    const qb = this.transactions
      .createQueryBuilder('t')
      .where('t.recipient_id = :recipientId', { recipientId })
      .orderBy('t.submitted_at', 'DESC')
      .addOrderBy('t.created_at', 'DESC')
      .take(limit);

    if (visibility.mode === 'user') {
      qb.andWhere('t.coordinator_id = :userId', { userId: visibility.userId });
    }

    return qb.getMany();
  }
}
