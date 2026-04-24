import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export type AuditAppendInput = {
  actorUserId: string | null;
  actorType: string;
  entityType: string;
  entityId: string;
  actionType: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogs: Repository<AuditLog>,
  ) {}

  private static readonly REDACT_KEYS = new Set([
    'password',
    'passwordHash',
    'otp',
    'token',
    'accessToken',
    'refreshToken',
  ]);

  private sanitize(
    values?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    if (!values) return null;
    const out: Record<string, unknown> = { ...values };
    for (const key of Object.keys(out)) {
      if (AuditService.REDACT_KEYS.has(key)) out[key] = '[REDACTED]';
    }
    return out;
  }

  async append(input: AuditAppendInput): Promise<void> {
    await this.auditLogs.save(
      this.auditLogs.create({
        actorUserId: input.actorUserId,
        actorType: input.actorType,
        entityType: input.entityType,
        entityId: input.entityId,
        actionType: input.actionType,
        oldValues: this.sanitize(input.oldValues),
        newValues: this.sanitize(input.newValues),
        metadata: this.sanitize(input.metadata),
      }),
    );
  }

  /** Persists an audit row using the given transactional EntityManager. */
  async appendWithManager(
    manager: EntityManager,
    input: AuditAppendInput,
  ): Promise<void> {
    const repo = manager.getRepository(AuditLog);
    await repo.save(
      repo.create({
        actorUserId: input.actorUserId,
        actorType: input.actorType,
        entityType: input.entityType,
        entityId: input.entityId,
        actionType: input.actionType,
        oldValues: this.sanitize(input.oldValues),
        newValues: this.sanitize(input.newValues),
        metadata: this.sanitize(input.metadata),
      }),
    );
  }
}
