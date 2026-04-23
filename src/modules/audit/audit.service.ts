import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async append(input: AuditAppendInput): Promise<void> {
    await this.auditLogs.save(
      this.auditLogs.create({
        actorUserId: input.actorUserId,
        actorType: input.actorType,
        entityType: input.entityType,
        entityId: input.entityId,
        actionType: input.actionType,
        oldValues: input.oldValues ?? null,
        newValues: input.newValues ?? null,
        metadata: input.metadata ?? null,
      }),
    );
  }
}
