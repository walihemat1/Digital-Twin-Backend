import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuditService } from '../audit/audit.service';
import { RecipientFeedback } from '../recipient-feedback/entities/recipient-feedback.entity';
import { User } from '../users/entities/user.entity';
import { CoordinatorAffirmation } from './entities/coordinator-affirmation.entity';
import { TransactionStatusHistory } from './entities/transaction-status-history.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionCompletionService } from './transaction-completion.service';

describe('TransactionCompletionService', () => {
  let service: TransactionCompletionService;
  let dataSource: {
    transaction: jest.Mock;
    manager: { findOne: jest.Mock };
  };
  let audit: { appendWithManager: jest.Mock };

  const coordAuth = { userId: 'aaaaaaaa-bbbb-cccc-dddd-coordinator111', role: UserRole.COORDINATOR_SENDER };

  beforeEach(async () => {
    audit = { appendWithManager: jest.fn().mockResolvedValue(undefined) };
    dataSource = {
      transaction: jest.fn(),
      manager: {
        findOne: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionCompletionService,
        { provide: DataSource, useValue: dataSource },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(TransactionCompletionService);
  });

  it('rejects when user is not coordinator/sender', async () => {
    dataSource.manager.findOne.mockResolvedValue({
      id: coordAuth.userId,
      role: UserRole.BROKER_A,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    await expect(
      service.affirmFeedbackAndComplete(coordAuth as any, 'tx-id', {}),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects when transaction is not owned by coordinator', async () => {
    dataSource.manager.findOne.mockResolvedValue({
      id: coordAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    const txRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
      const manager = {
        getRepository: (ent: unknown) => {
          if (ent === Transaction) return txRepo;
          throw new Error(`unexpected entity ${String(ent)}`);
        },
      };
      return fn(manager);
    });

    await expect(
      service.affirmFeedbackAndComplete(coordAuth as any, 'missing-tx', {}),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('conflicts when transaction is already completed', async () => {
    dataSource.manager.findOne.mockResolvedValue({
      id: coordAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    const txRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'tx-1',
        coordinatorId: coordAuth.userId,
        status: TransactionStatus.COMPLETED,
      }),
    };

    dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
      const manager = {
        getRepository: (ent: unknown) => {
          if (ent === Transaction) return txRepo;
          throw new Error(`unexpected entity ${String(ent)}`);
        },
      };
      return fn(manager);
    });

    await expect(
      service.affirmFeedbackAndComplete(coordAuth as any, 'tx-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects when transaction is not awaiting coordinator completion', async () => {
    dataSource.manager.findOne.mockResolvedValue({
      id: coordAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    const txRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'tx-1',
        coordinatorId: coordAuth.userId,
        status: TransactionStatus.DELIVERED,
      }),
    };

    dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
      const manager = {
        getRepository: (ent: unknown) => {
          if (ent === Transaction) return txRepo;
          throw new Error(`unexpected entity ${String(ent)}`);
        },
      };
      return fn(manager);
    });

    await expect(
      service.affirmFeedbackAndComplete(coordAuth as any, 'tx-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when feedback row is missing', async () => {
    dataSource.manager.findOne.mockResolvedValue({
      id: coordAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    const txRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'tx-1',
        coordinatorId: coordAuth.userId,
        status: TransactionStatus.FEEDBACK_SUBMITTED,
      }),
    };
    const feedbackRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
      const manager = {
        getRepository: (ent: unknown) => {
          if (ent === Transaction) return txRepo;
          if (ent === RecipientFeedback) return feedbackRepo;
          throw new Error(`unexpected entity ${String(ent)}`);
        },
      };
      return fn(manager);
    });

    await expect(
      service.affirmFeedbackAndComplete(coordAuth as any, 'tx-1', {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('conflicts when affirmation already exists', async () => {
    dataSource.manager.findOne.mockResolvedValue({
      id: coordAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    const txRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'tx-1',
        coordinatorId: coordAuth.userId,
        status: TransactionStatus.FEEDBACK_SUBMITTED,
      }),
    };
    const feedbackRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'fb-1' }),
    };
    const affirmationRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'aff-1' }),
    };

    dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
      const manager = {
        getRepository: (ent: unknown) => {
          if (ent === Transaction) return txRepo;
          if (ent === RecipientFeedback) return feedbackRepo;
          if (ent === CoordinatorAffirmation) return affirmationRepo;
          throw new Error(`unexpected entity ${String(ent)}`);
        },
      };
      return fn(manager);
    });

    await expect(
      service.affirmFeedbackAndComplete(coordAuth as any, 'tx-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('persists affirmation, completes transaction, writes history, and audits', async () => {
    dataSource.manager.findOne.mockResolvedValue({
      id: coordAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    const txRow = {
      id: 'tx-1',
      coordinatorId: coordAuth.userId,
      status: TransactionStatus.FEEDBACK_SUBMITTED,
      completedAt: null,
    };

    const txRepo = {
      findOne: jest.fn().mockResolvedValue(txRow),
      save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
    };
    const feedbackRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'fb-1', transactionId: 'tx-1' }),
    };
    const affirmationRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v) => v),
      save: jest.fn().mockResolvedValue({}),
    };
    const histRepo = {
      create: jest.fn((v) => v),
      save: jest.fn().mockResolvedValue({}),
    };

    dataSource.transaction.mockImplementation(async (fn: (m: unknown) => Promise<unknown>) => {
      const manager = {
        getRepository: (ent: unknown) => {
          if (ent === Transaction) return txRepo;
          if (ent === RecipientFeedback) return feedbackRepo;
          if (ent === CoordinatorAffirmation) return affirmationRepo;
          if (ent === TransactionStatusHistory) return histRepo;
          throw new Error(`unexpected entity ${String(ent)}`);
        },
      };
      return fn(manager);
    });

    await service.affirmFeedbackAndComplete(coordAuth as any, 'tx-1', {
      coordinatorComment: ' Looks correct ',
    });

    expect(affirmationRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinatorComment: 'Looks correct',
      }),
    );
    expect(txRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TransactionStatus.COMPLETED,
      }),
    );
    expect(histRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: TransactionStatus.FEEDBACK_SUBMITTED,
        toStatus: TransactionStatus.COMPLETED,
        changedByUserId: coordAuth.userId,
      }),
    );
    expect(audit.appendWithManager).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        actionType: 'transaction.coordinator_affirmed_completed',
        entityId: 'tx-1',
      }),
    );
  });
});
