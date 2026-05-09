import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { BrokerBAssignmentStatus } from '../../common/enums/broker-b-assignment-status.enum';
import { BrokerBAssignmentType } from '../../common/enums/broker-b-assignment-type.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { RecipientsRepository } from '../recipients/recipients.repository';
import { User } from '../users/entities/user.entity';
import { BrokerALocalAgentDetail } from './entities/broker-a-local-agent-detail.entity';
import { TransactionBrokerBAssignment } from './entities/transaction-broker-b-assignment.entity';
import { TransactionStatusHistory } from './entities/transaction-status-history.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let dataSource: { transaction: jest.Mock };
  let txRepo: jest.Mocked<Pick<Repository<Transaction>, 'find' | 'findOne' | 'save'>>;
  let histRepo: jest.Mocked<
    Pick<Repository<TransactionStatusHistory>, 'find' | 'save'>
  >;
  let usersRepo: jest.Mocked<Pick<Repository<User>, 'findOne'>>;
  let brokerBAssignmentsRepo: jest.Mocked<
    Pick<Repository<TransactionBrokerBAssignment>, 'findOne'>
  >;
  let recipientsRepo: jest.Mocked<
    Pick<RecipientsRepository, 'findEligibleForTransactionById'>
  >;
  let configSvc: { get: jest.Mock };
  let workflowHooks: {
    onBrokerAAccepted: jest.Mock;
    onBrokerADeclined: jest.Mock;
    onBrokerAReadyForBrokerB: jest.Mock;
  };

  const auth = { userId: 'coord-1', role: UserRole.COORDINATOR_SENDER };

  const baseSubmit = {
    recipientId: 'rec-1',
    brokerAUserId: 'broker-1',
    transferMethod: 'bank',
    verificationMethod: 'sms',
    amount: 100.5,
  };

  beforeEach(() => {
    txRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    histRepo = { find: jest.fn(), save: jest.fn() };
    usersRepo = { findOne: jest.fn() };
    brokerBAssignmentsRepo = { findOne: jest.fn() };
    recipientsRepo = { findEligibleForTransactionById: jest.fn() };
    dataSource = {
      transaction: jest.fn(),
    };
    configSvc = { get: jest.fn().mockReturnValue(false) };
    workflowHooks = {
      onBrokerAAccepted: jest.fn().mockResolvedValue(undefined),
      onBrokerADeclined: jest.fn().mockResolvedValue(undefined),
      onBrokerAReadyForBrokerB: jest.fn().mockResolvedValue(undefined),
    };

    service = new TransactionsService(
      dataSource as any,
      txRepo as any,
      histRepo as any,
      brokerBAssignmentsRepo as any,
      usersRepo as any,
      recipientsRepo as any,
      configSvc as any,
      workflowHooks as any,
    );
  });

  it('submit rejects non-coordinator role', async () => {
    usersRepo.findOne.mockResolvedValue({
      id: 'x',
      role: UserRole.BROKER_A,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    await expect(service.submit(auth, baseSubmit as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('submit rejects inactive coordinator', async () => {
    usersRepo.findOne.mockResolvedValue({
      id: auth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.PENDING_APPROVAL,
    } as User);

    await expect(service.submit(auth, baseSubmit as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('submit rejects ineligible recipient', async () => {
    usersRepo.findOne.mockResolvedValue({
      id: auth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);
    recipientsRepo.findEligibleForTransactionById.mockResolvedValue(null);

    await expect(service.submit(auth, baseSubmit as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('submit rejects broker that is not Broker A role', async () => {
    usersRepo.findOne
      .mockResolvedValueOnce({
        id: auth.userId,
        role: UserRole.COORDINATOR_SENDER,
        accountStatus: AccountStatus.ACTIVE,
      } as User)
      .mockResolvedValueOnce({
        id: baseSubmit.brokerAUserId,
        role: UserRole.COORDINATOR_SENDER,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

    recipientsRepo.findEligibleForTransactionById.mockResolvedValue({
      id: 'rec-1',
    } as any);

    await expect(service.submit(auth, baseSubmit as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('submit rejects inactive Broker A', async () => {
    usersRepo.findOne
      .mockResolvedValueOnce({
        id: auth.userId,
        role: UserRole.COORDINATOR_SENDER,
        accountStatus: AccountStatus.ACTIVE,
      } as User)
      .mockResolvedValueOnce({
        id: baseSubmit.brokerAUserId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.SUSPENDED,
      } as User);

    recipientsRepo.findEligibleForTransactionById.mockResolvedValue({
      id: 'rec-1',
    } as any);

    await expect(service.submit(auth, baseSubmit as any)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('submit creates pending transaction and initial history in one DB transaction', async () => {
    usersRepo.findOne
      .mockResolvedValueOnce({
        id: auth.userId,
        role: UserRole.COORDINATOR_SENDER,
        accountStatus: AccountStatus.ACTIVE,
      } as User)
      .mockResolvedValueOnce({
        id: baseSubmit.brokerAUserId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

    recipientsRepo.findEligibleForTransactionById.mockResolvedValue({
      id: 'rec-1',
      verificationStatus: VerificationStatus.UNVERIFIED,
    } as any);

    const savedTx = Object.assign(new Transaction(), {
      id: 'txn-1',
      coordinatorId: auth.userId,
      recipientId: baseSubmit.recipientId,
      brokerAUserId: baseSubmit.brokerAUserId,
      transferMethod: 'bank',
      verificationMethod: 'sms',
      amount: '100.50',
      currency: 'USD',
      description: null,
      status: TransactionStatus.PENDING,
      currentStage: null,
      submittedAt: new Date('2026-05-01T00:00:00.000Z'),
      deliveryConfirmedAt: null,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const savedHist = Object.assign(new TransactionStatusHistory(), {
      id: 'h1',
      transactionId: 'txn-1',
      fromStatus: null,
      toStatus: TransactionStatus.PENDING,
      changedByUserId: auth.userId,
      changeReason: null,
      metadata: null,
      createdAt: new Date(),
    });

    const txRepoMock = {
      create: jest.fn((v) => Object.assign(new Transaction(), v)),
      save: jest.fn().mockResolvedValue(savedTx),
    };
    const histRepoMock = {
      create: jest.fn((v) => Object.assign(new TransactionStatusHistory(), v)),
      save: jest.fn().mockResolvedValue(savedHist),
    };

    dataSource.transaction.mockImplementation(async (fn: any) => {
      const manager = {
        getRepository: (entity: unknown) => {
          if (entity === Transaction) return txRepoMock;
          if (entity === TransactionStatusHistory) return histRepoMock;
          throw new Error('unexpected entity');
        },
      };
      return fn(manager);
    });

    const out = await service.submit(auth, baseSubmit as any);

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(txRepoMock.save).toHaveBeenCalled();
    expect(histRepoMock.save).toHaveBeenCalled();
    expect(out.id).toBe('txn-1');
    expect(out.status).toBe(TransactionStatus.PENDING);
    expect(out.amount).toBe('100.50');
    expect(out.status_history).toHaveLength(1);
    expect(out.status_history[0].to_status).toBe(TransactionStatus.PENDING);
    expect(out.status_history[0].from_status).toBeNull();
  });

  describe('Broker A visibility', () => {
    const brokerAuth = { userId: 'broker-1', role: UserRole.BROKER_A };

    it('listForBrokerA rejects user that is not Broker A', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.COORDINATOR_SENDER,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      await expect(
        service.listForBrokerA(brokerAuth),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(txRepo.find).not.toHaveBeenCalled();
    });

    it('listForBrokerA rejects inactive Broker A', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.PENDING_APPROVAL,
      } as User);

      await expect(
        service.listForBrokerA(brokerAuth),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(txRepo.find).not.toHaveBeenCalled();
    });

    it('listForBrokerA returns only transactions assigned to this broker', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const mine = Object.assign(new Transaction(), {
        id: 't1',
        coordinatorId: 'c1',
        recipientId: 'r1',
        brokerAUserId: brokerAuth.userId,
        status: TransactionStatus.PENDING,
        amount: '10.00',
        currency: 'USD',
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      txRepo.find.mockResolvedValue([mine]);

      const out = await service.listForBrokerA(brokerAuth);

      expect(txRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { brokerAUserId: brokerAuth.userId },
        }),
      );
      expect(out).toHaveLength(1);
      expect(out[0].id).toBe('t1');
      expect(out[0].broker_a_user_id).toBe(brokerAuth.userId);
    });

    it('getDetailForBrokerA returns NotFound when transaction is assigned to another broker', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      txRepo.findOne.mockResolvedValue(
        Object.assign(new Transaction(), {
          id: 't-other',
          brokerAUserId: 'other-broker',
        }),
      );

      await expect(
        service.getDetailForBrokerA(brokerAuth, 't-other'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(histRepo.find).not.toHaveBeenCalled();
    });

    it('getDetailForBrokerA returns detail and history when assigned', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const tx = Object.assign(new Transaction(), {
        id: 't1',
        coordinatorId: 'c1',
        recipientId: 'r1',
        brokerAUserId: brokerAuth.userId,
        transferMethod: 'bank',
        verificationMethod: 'sms',
        description: null,
        status: TransactionStatus.PENDING,
        currentStage: null,
        amount: '10.00',
        currency: 'USD',
        submittedAt: new Date(),
        deliveryConfirmedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      txRepo.findOne.mockResolvedValue(tx);
      histRepo.find.mockResolvedValue([
        Object.assign(new TransactionStatusHistory(), {
          id: 'h1',
          transactionId: 't1',
          fromStatus: null,
          toStatus: TransactionStatus.PENDING,
          changedByUserId: 'c1',
          changeReason: null,
          createdAt: new Date(),
        }),
      ]);

      const out = await service.getDetailForBrokerA(brokerAuth, 't1');

      expect(out.id).toBe('t1');
      expect(out.broker_a_user_id).toBe(brokerAuth.userId);
      expect(out.status_history).toHaveLength(1);
    });
  });

  describe('Broker B visibility', () => {
    const brokerBAuth = { userId: 'broker-b-1', role: UserRole.BROKER_B };

    const mockListQueryBuilder = (rows: Transaction[]) => {
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue(rows),
      };
      txRepo.createQueryBuilder = jest.fn().mockReturnValue(qb);
      return qb;
    };

    it('listForBrokerB rejects user that is not Broker B', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerBAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      await expect(service.listForBrokerB(brokerBAuth)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(txRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('listForBrokerB rejects inactive Broker B', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerBAuth.userId,
        role: UserRole.BROKER_B,
        accountStatus: AccountStatus.PENDING_APPROVAL,
      } as User);

      await expect(service.listForBrokerB(brokerBAuth)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(txRepo.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('listForBrokerB queries assigned internal-eligible transactions only', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerBAuth.userId,
        role: UserRole.BROKER_B,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const mine = Object.assign(new Transaction(), {
        id: 't-bb-1',
        coordinatorId: 'c1',
        recipientId: 'r1',
        brokerAUserId: 'broker-a-1',
        status: TransactionStatus.AWAITING_BROKER_B,
        amount: '25.00',
        currency: 'USD',
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const qb = mockListQueryBuilder([mine]);

      const out = await service.listForBrokerB(brokerBAuth, { offset: 0, limit: 10 });

      expect(txRepo.createQueryBuilder).toHaveBeenCalledWith('tx');
      expect(qb.innerJoin).toHaveBeenCalledWith(
        TransactionBrokerBAssignment,
        'bba',
        expect.stringContaining('bba.internal_user_id = :bbUserId'),
        expect.objectContaining({
          bbUserId: brokerBAuth.userId,
          bbAssignmentType: BrokerBAssignmentType.INTERNAL_USER,
        }),
      );
      expect(qb.where).toHaveBeenCalledWith(
        'bba.assignment_status IN (:...bbAssignmentStatuses)',
        {
          bbAssignmentStatuses: [
            BrokerBAssignmentStatus.ASSIGNED,
            BrokerBAssignmentStatus.ACCEPTED,
          ],
        },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'tx.status IN (:...bbTxStatuses)',
        expect.objectContaining({
          bbTxStatuses: expect.arrayContaining([
            TransactionStatus.AWAITING_BROKER_B,
            TransactionStatus.BROKER_B_ACCEPTED,
          ]),
        }),
      );
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(10);
      expect(out).toHaveLength(1);
      expect(out[0].id).toBe('t-bb-1');
    });

    it('getDetailForBrokerB returns NotFound when transaction has no open internal assignment', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerBAuth.userId,
        role: UserRole.BROKER_B,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      txRepo.findOne.mockResolvedValue(
        Object.assign(new Transaction(), {
          id: 't-other',
          status: TransactionStatus.AWAITING_BROKER_B,
        }),
      );
      brokerBAssignmentsRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getDetailForBrokerB(brokerBAuth, 't-other'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(histRepo.find).not.toHaveBeenCalled();
    });

    it('getDetailForBrokerB returns NotFound when transaction is not Broker-B-eligible stage', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerBAuth.userId,
        role: UserRole.BROKER_B,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      txRepo.findOne.mockResolvedValue(
        Object.assign(new Transaction(), {
          id: 't-pending',
          status: TransactionStatus.PENDING,
        }),
      );
      brokerBAssignmentsRepo.findOne.mockResolvedValue({} as TransactionBrokerBAssignment);

      await expect(
        service.getDetailForBrokerB(brokerBAuth, 't-pending'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(histRepo.find).not.toHaveBeenCalled();
    });

    it('getDetailForBrokerB returns detail when assigned and stage is eligible', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerBAuth.userId,
        role: UserRole.BROKER_B,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const tx = Object.assign(new Transaction(), {
        id: 't-bb-1',
        coordinatorId: 'c1',
        recipientId: 'r1',
        brokerAUserId: 'broker-a-1',
        transferMethod: 'bank',
        verificationMethod: 'sms',
        description: null,
        status: TransactionStatus.AWAITING_BROKER_B,
        currentStage: null,
        amount: '25.00',
        currency: 'USD',
        submittedAt: new Date(),
        deliveryConfirmedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      txRepo.findOne.mockResolvedValue(tx);
      brokerBAssignmentsRepo.findOne.mockResolvedValue({
        id: 'asg-1',
        transactionId: tx.id,
        internalUserId: brokerBAuth.userId,
        assignmentType: BrokerBAssignmentType.INTERNAL_USER,
        assignmentStatus: BrokerBAssignmentStatus.ASSIGNED,
      } as TransactionBrokerBAssignment);

      histRepo.find.mockResolvedValue([
        Object.assign(new TransactionStatusHistory(), {
          id: 'h1',
          transactionId: tx.id,
          fromStatus: TransactionStatus.BROKER_A_ACCEPTED,
          toStatus: TransactionStatus.AWAITING_BROKER_B,
          changedByUserId: 'broker-a-1',
          changeReason: null,
          createdAt: new Date(),
        }),
      ]);

      const out = await service.getDetailForBrokerB(brokerBAuth, tx.id);

      expect(out.id).toBe(tx.id);
      expect(out.status).toBe(TransactionStatus.AWAITING_BROKER_B);
      expect(out.status_history).toHaveLength(1);
    });
  });

  describe('Broker A accept / decline', () => {
    const brokerAuth = { userId: 'broker-1', role: UserRole.BROKER_A };

    const pendingTransaction = () =>
      Object.assign(new Transaction(), {
        id: 't1',
        coordinatorId: 'c1',
        recipientId: 'r1',
        brokerAUserId: brokerAuth.userId,
        transferMethod: 'bank',
        verificationMethod: 'sms',
        description: null,
        status: TransactionStatus.PENDING,
        currentStage: null,
        amount: '10.00',
        currency: 'USD',
        submittedAt: new Date(),
        deliveryConfirmedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    it('brokerAAccept rejects non-Broker A', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.COORDINATOR_SENDER,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      await expect(service.brokerAAccept(brokerAuth, 't1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('brokerAAccept returns NotFound when transaction is not assigned to this broker', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const txRepoMock = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
      };
      const histRepoMock = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
      };

      dataSource.transaction.mockImplementation(async (fn: any) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Transaction) return txRepoMock;
            if (entity === TransactionStatusHistory) return histRepoMock;
            throw new Error('unexpected entity');
          },
        };
        return fn(manager);
      });

      await expect(service.brokerAAccept(brokerAuth, 'missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(workflowHooks.onBrokerAAccepted).not.toHaveBeenCalled();
    });

    it('brokerAAccept rejects when status is not pending', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const tx = pendingTransaction();
      tx.status = TransactionStatus.BROKER_A_ACCEPTED;

      const txRepoMock = {
        findOne: jest.fn().mockResolvedValue(tx),
        save: jest.fn(),
      };
      const histRepoMock = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
      };

      dataSource.transaction.mockImplementation(async (fn: any) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Transaction) return txRepoMock;
            if (entity === TransactionStatusHistory) return histRepoMock;
            throw new Error('unexpected entity');
          },
        };
        return fn(manager);
      });

      await expect(service.brokerAAccept(brokerAuth, 't1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(txRepoMock.save).not.toHaveBeenCalled();
      expect(workflowHooks.onBrokerAAccepted).not.toHaveBeenCalled();
    });

    it('brokerAAccept updates status, appends history, and invokes hook', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const pending = pendingTransaction();
      const accepted = Object.assign(new Transaction(), {
        ...pending,
        status: TransactionStatus.BROKER_A_ACCEPTED,
      });

      const histInitial = Object.assign(new TransactionStatusHistory(), {
        id: 'h0',
        transactionId: 't1',
        fromStatus: null,
        toStatus: TransactionStatus.PENDING,
        changedByUserId: 'c1',
        changeReason: null,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      });

      const txRepoMock = {
        findOne: jest.fn().mockResolvedValue(pending),
        save: jest.fn().mockResolvedValue(accepted),
      };
      const histRepoMock = {
        create: jest.fn((v) => Object.assign(new TransactionStatusHistory(), v)),
        save: jest.fn().mockImplementation((h) => Promise.resolve(h)),
        find: jest.fn().mockResolvedValue([
          histInitial,
          Object.assign(new TransactionStatusHistory(), {
            id: 'h1',
            transactionId: 't1',
            fromStatus: TransactionStatus.PENDING,
            toStatus: TransactionStatus.BROKER_A_ACCEPTED,
            changedByUserId: brokerAuth.userId,
            changeReason: null,
            createdAt: new Date('2026-05-01T01:00:00.000Z'),
          }),
        ]),
      };

      dataSource.transaction.mockImplementation(async (fn: any) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Transaction) return txRepoMock;
            if (entity === TransactionStatusHistory) return histRepoMock;
            throw new Error('unexpected entity');
          },
        };
        return fn(manager);
      });

      const out = await service.brokerAAccept(brokerAuth, 't1');

      expect(out.status).toBe(TransactionStatus.BROKER_A_ACCEPTED);
      expect(out.status_history).toHaveLength(2);
      expect(out.status_history[1].to_status).toBe(TransactionStatus.BROKER_A_ACCEPTED);
      expect(out.status_history[1].from_status).toBe(TransactionStatus.PENDING);
      expect(out.status_history[1].changed_by_user_id).toBe(brokerAuth.userId);
      expect(workflowHooks.onBrokerAAccepted).toHaveBeenCalledWith(accepted);
    });

    it('brokerADecline rejects when decline reason is required by policy and missing', async () => {
      configSvc.get.mockReturnValue(true);
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      await expect(
        service.brokerADecline(brokerAuth, 't1', { reason: '   ' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('brokerADecline rejects when status is not pending', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const tx = pendingTransaction();
      tx.status = TransactionStatus.BROKER_A_DECLINED;

      const txRepoMock = {
        findOne: jest.fn().mockResolvedValue(tx),
        save: jest.fn(),
      };
      const histRepoMock = {
        create: jest.fn(),
        save: jest.fn(),
        find: jest.fn(),
      };

      dataSource.transaction.mockImplementation(async (fn: any) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Transaction) return txRepoMock;
            if (entity === TransactionStatusHistory) return histRepoMock;
            throw new Error('unexpected entity');
          },
        };
        return fn(manager);
      });

      await expect(
        service.brokerADecline(brokerAuth, 't1', { reason: 'no capacity' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(workflowHooks.onBrokerADeclined).not.toHaveBeenCalled();
    });

    it('brokerADecline stores reason on history when provided', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const pending = pendingTransaction();
      const declined = Object.assign(new Transaction(), {
        ...pending,
        status: TransactionStatus.BROKER_A_DECLINED,
      });

      const histInitial = Object.assign(new TransactionStatusHistory(), {
        id: 'h0',
        transactionId: 't1',
        fromStatus: null,
        toStatus: TransactionStatus.PENDING,
        changedByUserId: 'c1',
        changeReason: null,
        createdAt: new Date(),
      });

      const declineHist = Object.assign(new TransactionStatusHistory(), {
        id: 'h1',
        transactionId: 't1',
        fromStatus: TransactionStatus.PENDING,
        toStatus: TransactionStatus.BROKER_A_DECLINED,
        changedByUserId: brokerAuth.userId,
        changeReason: 'Cannot fulfill this corridor',
        createdAt: new Date(),
      });

      const txRepoMock = {
        findOne: jest.fn().mockResolvedValue(pending),
        save: jest.fn().mockResolvedValue(declined),
      };
      const histRepoMock = {
        create: jest.fn((v) => Object.assign(new TransactionStatusHistory(), v)),
        save: jest.fn().mockImplementation((h) => Promise.resolve(h)),
        find: jest.fn().mockResolvedValue([histInitial, declineHist]),
      };

      dataSource.transaction.mockImplementation(async (fn: any) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Transaction) return txRepoMock;
            if (entity === TransactionStatusHistory) return histRepoMock;
            throw new Error('unexpected entity');
          },
        };
        return fn(manager);
      });

      const out = await service.brokerADecline(brokerAuth, 't1', {
        reason: 'Cannot fulfill this corridor',
      });

      expect(out.status).toBe(TransactionStatus.BROKER_A_DECLINED);
      expect(out.status_history[1].change_reason).toBe('Cannot fulfill this corridor');
      expect(workflowHooks.onBrokerADeclined).toHaveBeenCalledWith(
        declined,
        'Cannot fulfill this corridor',
      );
    });
  });

  describe('Broker A local agent details', () => {
    const brokerAuth = { userId: 'broker-1', role: UserRole.BROKER_A };

    const acceptedTransaction = () =>
      Object.assign(new Transaction(), {
        id: 't1',
        coordinatorId: 'c1',
        recipientId: 'r1',
        brokerAUserId: brokerAuth.userId,
        transferMethod: 'bank',
        verificationMethod: 'sms',
        description: null,
        status: TransactionStatus.BROKER_A_ACCEPTED,
        currentStage: null,
        amount: '10.00',
        currency: 'USD',
        submittedAt: new Date(),
        deliveryConfirmedAt: null,
        completedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    const validDto = {
      organizationName: 'Acme Corp',
      forwardingValue: 250.5,
      localAgentName: 'Jane Agent',
      localAgentPhone: '+15551234567',
      coordinationMethod: 'WhatsApp',
    };

    it('brokerASubmitLocalAgentDetails rejects when transaction is still pending', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const pending = acceptedTransaction();
      pending.status = TransactionStatus.PENDING;

      const txRepoMock = {
        findOne: jest.fn().mockResolvedValue(pending),
        save: jest.fn(),
      };
      const histRepoMock = { create: jest.fn(), save: jest.fn(), find: jest.fn() };
      const detailRepoMock = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };

      dataSource.transaction.mockImplementation(async (fn: any) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Transaction) return txRepoMock;
            if (entity === TransactionStatusHistory) return histRepoMock;
            if (entity === BrokerALocalAgentDetail) return detailRepoMock;
            throw new Error('unexpected entity');
          },
        };
        return fn(manager);
      });

      await expect(
        service.brokerASubmitLocalAgentDetails(brokerAuth, 't1', validDto as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(detailRepoMock.save).not.toHaveBeenCalled();
      expect(workflowHooks.onBrokerAReadyForBrokerB).not.toHaveBeenCalled();
    });

    it('brokerASubmitLocalAgentDetails rejects when already awaiting Broker B', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const forwarded = acceptedTransaction();
      forwarded.status = TransactionStatus.AWAITING_BROKER_B;

      const txRepoMock = {
        findOne: jest.fn().mockResolvedValue(forwarded),
        save: jest.fn(),
      };
      const histRepoMock = { create: jest.fn(), save: jest.fn(), find: jest.fn() };
      const detailRepoMock = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };

      dataSource.transaction.mockImplementation(async (fn: any) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Transaction) return txRepoMock;
            if (entity === TransactionStatusHistory) return histRepoMock;
            if (entity === BrokerALocalAgentDetail) return detailRepoMock;
            throw new Error('unexpected entity');
          },
        };
        return fn(manager);
      });

      await expect(
        service.brokerASubmitLocalAgentDetails(brokerAuth, 't1', validDto as any),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(workflowHooks.onBrokerAReadyForBrokerB).not.toHaveBeenCalled();
    });

    it('brokerASubmitLocalAgentDetails persists details, transitions status, and invokes hook', async () => {
      usersRepo.findOne.mockResolvedValue({
        id: brokerAuth.userId,
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

      const accepted = acceptedTransaction();
      const awaiting = Object.assign(new Transaction(), {
        ...accepted,
        status: TransactionStatus.AWAITING_BROKER_B,
      });

      const histPending = Object.assign(new TransactionStatusHistory(), {
        id: 'h0',
        transactionId: 't1',
        fromStatus: null,
        toStatus: TransactionStatus.PENDING,
        changedByUserId: 'c1',
        changeReason: null,
        createdAt: new Date('2026-05-01T00:00:00.000Z'),
      });
      const histAccepted = Object.assign(new TransactionStatusHistory(), {
        id: 'h1',
        transactionId: 't1',
        fromStatus: TransactionStatus.PENDING,
        toStatus: TransactionStatus.BROKER_A_ACCEPTED,
        changedByUserId: brokerAuth.userId,
        changeReason: null,
        createdAt: new Date('2026-05-01T01:00:00.000Z'),
      });
      const histAwaiting = Object.assign(new TransactionStatusHistory(), {
        id: 'h2',
        transactionId: 't1',
        fromStatus: TransactionStatus.BROKER_A_ACCEPTED,
        toStatus: TransactionStatus.AWAITING_BROKER_B,
        changedByUserId: brokerAuth.userId,
        changeReason: null,
        createdAt: new Date('2026-05-01T02:00:00.000Z'),
      });

      const txRepoMock = {
        findOne: jest.fn().mockResolvedValue(accepted),
        save: jest.fn().mockResolvedValue(awaiting),
      };
      const detailRepoMock = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((v) => Object.assign(new BrokerALocalAgentDetail(), v)),
        save: jest.fn().mockImplementation((d) => Promise.resolve(d)),
      };
      const histRepoMock = {
        create: jest.fn((v) => Object.assign(new TransactionStatusHistory(), v)),
        save: jest.fn().mockImplementation((h) => Promise.resolve(h)),
        find: jest.fn().mockResolvedValue([histPending, histAccepted, histAwaiting]),
      };

      dataSource.transaction.mockImplementation(async (fn: any) => {
        const manager = {
          getRepository: (entity: unknown) => {
            if (entity === Transaction) return txRepoMock;
            if (entity === TransactionStatusHistory) return histRepoMock;
            if (entity === BrokerALocalAgentDetail) return detailRepoMock;
            throw new Error('unexpected entity');
          },
        };
        return fn(manager);
      });

      const out = await service.brokerASubmitLocalAgentDetails(
        brokerAuth,
        't1',
        validDto as any,
      );

      expect(out.status).toBe(TransactionStatus.AWAITING_BROKER_B);
      expect(out.status_history).toHaveLength(3);
      expect(out.status_history[2].to_status).toBe(TransactionStatus.AWAITING_BROKER_B);
      expect(out.status_history[2].from_status).toBe(TransactionStatus.BROKER_A_ACCEPTED);
      expect(detailRepoMock.save).toHaveBeenCalled();
      const savedDetail = detailRepoMock.save.mock.calls[0][0] as BrokerALocalAgentDetail;
      expect(savedDetail.forwardingValue).toBe('250.50');
      expect(savedDetail.submittedBy).toBe(brokerAuth.userId);
      expect(workflowHooks.onBrokerAReadyForBrokerB).toHaveBeenCalledWith(awaiting);
    });
  });
});
