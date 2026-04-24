import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { ApprovalRequestStatus } from '../../common/enums/approval-request-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { User } from '../users/entities/user.entity';
import { ApprovalRequest } from './entities/approval-request.entity';

const ENTITY_TYPE_APPROVAL_REQUEST = 'approval_request';
const ACTOR_TYPE_ADMIN_USER = 'admin_user';

export type AdminApprovalRequestListItem = {
  id: string;
  status: ApprovalRequestStatus;
  requestType: string;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
  reviewedByUserId: string | null;
  rejectionReason: string | null;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    accountStatus: AccountStatus;
  } | null;
};

@Injectable()
export class ApprovalRequestsService {
  constructor(
    @InjectRepository(ApprovalRequest)
    private readonly approvalRequests: Repository<ApprovalRequest>,
    private readonly audit: AuditService,
  ) {}

  async listForAdmin(
    status?: ApprovalRequestStatus,
  ): Promise<AdminApprovalRequestListItem[]> {
    const qb = this.approvalRequests
      .createQueryBuilder('ar')
      .leftJoinAndSelect('ar.user', 'user')
      .orderBy('ar.createdAt', 'DESC');

    if (status) {
      qb.andWhere('ar.status = :status', { status });
    }

    const rows = await qb.getMany();

    return rows.map((ar) => ({
      id: ar.id,
      status: ar.status,
      requestType: ar.requestType,
      createdAt: ar.createdAt,
      updatedAt: ar.updatedAt,
      reviewedAt: ar.reviewedAt,
      reviewedByUserId: ar.reviewedByUserId,
      rejectionReason: ar.rejectionReason,
      user: ar.user
        ? {
            id: ar.user.id,
            email: ar.user.email,
            firstName: ar.user.firstName,
            lastName: ar.user.lastName,
            role: ar.user.role,
            accountStatus: ar.user.accountStatus,
          }
        : null,
    }));
  }

  async approve(requestId: string, adminUserId: string): Promise<void> {
    await this.approvalRequests.manager.transaction(async (manager) => {
      const approvalRepo = manager.getRepository(ApprovalRequest);
      const userRepo = manager.getRepository(User);

      const request = await approvalRepo.findOne({
        where: { id: requestId },
        relations: { user: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw new NotFoundException('Approval request not found.');
      }

      if (request.status !== ApprovalRequestStatus.PENDING) {
        throw new ConflictException('Approval request is not pending.');
      }

      if (request.user.accountStatus !== AccountStatus.PENDING_APPROVAL) {
        throw new ConflictException('User is not awaiting approval.');
      }

      if (request.user.role !== UserRole.COORDINATOR_SENDER) {
        throw new ConflictException(
          'User role does not require this approval.',
        );
      }

      const prevApproval = {
        status: request.status,
        reviewedByUserId: request.reviewedByUserId,
        reviewedAt: request.reviewedAt,
      };

      request.status = ApprovalRequestStatus.APPROVED;
      request.reviewedByUserId = adminUserId;
      request.reviewedAt = new Date();
      request.rejectionReason = null;
      request.user.accountStatus = AccountStatus.ACTIVE;

      await approvalRepo.save(request);
      await userRepo.save(request.user);

      await this.audit.appendWithManager(manager, {
        actorUserId: adminUserId,
        actorType: ACTOR_TYPE_ADMIN_USER,
        entityType: ENTITY_TYPE_APPROVAL_REQUEST,
        entityId: request.id,
        actionType: 'approval_request.approved',
        oldValues: prevApproval,
        newValues: {
          status: request.status,
          reviewedByUserId: request.reviewedByUserId,
          reviewedAt: request.reviewedAt,
          userAccountStatus: request.user.accountStatus,
        },
        metadata: { subjectUserId: request.userId },
      });
    });
  }

  async reject(
    requestId: string,
    adminUserId: string,
    rejectionReason: string,
  ): Promise<void> {
    const trimmed = rejectionReason.trim();
    if (trimmed.length < 3) {
      throw new BadRequestException('rejectionReason is required.');
    }

    await this.approvalRequests.manager.transaction(async (manager) => {
      const approvalRepo = manager.getRepository(ApprovalRequest);
      const userRepo = manager.getRepository(User);

      const request = await approvalRepo.findOne({
        where: { id: requestId },
        relations: { user: true },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw new NotFoundException('Approval request not found.');
      }

      if (request.status !== ApprovalRequestStatus.PENDING) {
        throw new ConflictException('Approval request is not pending.');
      }

      if (request.user.accountStatus !== AccountStatus.PENDING_APPROVAL) {
        throw new ConflictException('User is not awaiting approval.');
      }

      const prevApproval = {
        status: request.status,
        reviewedByUserId: request.reviewedByUserId,
        reviewedAt: request.reviewedAt,
        rejectionReason: request.rejectionReason,
      };

      request.status = ApprovalRequestStatus.REJECTED;
      request.reviewedByUserId = adminUserId;
      request.reviewedAt = new Date();
      request.rejectionReason = trimmed;
      request.user.accountStatus = AccountStatus.REJECTED;

      await approvalRepo.save(request);
      await userRepo.save(request.user);

      await this.audit.appendWithManager(manager, {
        actorUserId: adminUserId,
        actorType: ACTOR_TYPE_ADMIN_USER,
        entityType: ENTITY_TYPE_APPROVAL_REQUEST,
        entityId: request.id,
        actionType: 'approval_request.rejected',
        oldValues: prevApproval,
        newValues: {
          status: request.status,
          reviewedByUserId: request.reviewedByUserId,
          reviewedAt: request.reviewedAt,
          rejectionReason: request.rejectionReason,
          userAccountStatus: request.user.accountStatus,
        },
        metadata: { subjectUserId: request.userId },
      });
    });
  }
}
