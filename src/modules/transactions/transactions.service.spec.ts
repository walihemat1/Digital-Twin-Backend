import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { RecipientsRepository } from '../recipients/recipients.repository';
import { User } from '../users/entities/user.entity';
import { TransactionStatusHistory } from './entities/transaction-status-history.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionsService } from './transactions.service';

describe('TransactionsService', () => {
  let service: TransactionsService;
  let dataSource: { transaction: jest.Mock };
  let txRepo: jest.Mocked<Pick<Repository<Transaction>, 'find' | 'findOne'>>;
  let histRepo: jest.Mocked<Pick<Repository<TransactionStatusHistory>, 'find'>>;
  let usersRepo: jest.Mocked<Pick<Repository<User>, 'findOne'>>;
  let recipientsRepo: jest.Mocked<
    Pick<RecipientsRepository, 'findEligibleForTransactionById'>
  >;

  const auth = { userId: 'coord-1', role: UserRole.COORDINATOR_SENDER };

  const baseSubmit = {
    recipientId: 'rec-1',
    brokerAUserId: 'broker-1',
    transferMethod: 'bank',
    verificationMethod: 'sms',
    amount: 100.5,
  };

  beforeEach(() => {
    txRepo = { find: jest.fn(), findOne: jest.fn() };
    histRepo = { find: jest.fn() };
    usersRepo = { findOne: jest.fn() };
    recipientsRepo = { findEligibleForTransactionById: jest.fn() };
    dataSource = {
      transaction: jest.fn(),
    };

    service = new TransactionsService(
      dataSource as any,
      txRepo as any,
      histRepo as any,
      usersRepo as any,
      recipientsRepo as any,
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
});
