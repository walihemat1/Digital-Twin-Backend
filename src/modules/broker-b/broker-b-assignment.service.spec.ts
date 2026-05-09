import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { BrokerBAssignmentStatus } from '../../common/enums/broker-b-assignment-status.enum';
import { BrokerBAssignmentType } from '../../common/enums/broker-b-assignment-type.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { ExternalContact } from '../external-contacts/entities/external-contact.entity';
import { TransactionBrokerBAssignment } from '../transactions/entities/transaction-broker-b-assignment.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { User } from '../users/entities/user.entity';
import { BrokerBAssignmentService } from './broker-b-assignment.service';

describe('BrokerBAssignmentService', () => {
  let service: BrokerBAssignmentService;
  let usersRepo: jest.Mocked<Pick<Repository<User>, 'findOne'>>;
  let txRepo: jest.Mocked<Pick<Repository<Transaction>, 'findOne'>>;
  let assignRepo: jest.Mocked<
    Pick<
      Repository<TransactionBrokerBAssignment>,
      'findOne' | 'create' | 'save'
    >
  >;
  let extRepo: jest.Mocked<Pick<Repository<ExternalContact>, 'findOne'>>;

  const coordinatorAuth = { userId: 'c1', role: UserRole.COORDINATOR_SENDER };

  beforeEach(async () => {
    usersRepo = { findOne: jest.fn() };
    txRepo = { findOne: jest.fn() };
    assignRepo = {
      findOne: jest.fn(),
      create: jest.fn((v) => Object.assign(new TransactionBrokerBAssignment(), v)),
      save: jest.fn(async (v) => v),
    };
    extRepo = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrokerBAssignmentService,
        { provide: getRepositoryToken(Transaction), useValue: txRepo },
        {
          provide: getRepositoryToken(TransactionBrokerBAssignment),
          useValue: assignRepo,
        },
        { provide: getRepositoryToken(User), useValue: usersRepo },
        { provide: getRepositoryToken(ExternalContact), useValue: extRepo },
      ],
    }).compile();

    service = module.get(BrokerBAssignmentService);
  });

  const awaitingTx = () =>
    Object.assign(new Transaction(), {
      id: 't1',
      coordinatorId: coordinatorAuth.userId,
      status: TransactionStatus.AWAITING_BROKER_B,
    });

  it('assign rejects non-coordinator', async () => {
    usersRepo.findOne.mockResolvedValue({
      id: 'x',
      role: UserRole.BROKER_A,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    await expect(
      service.assign(coordinatorAuth, 't1', {
        assignmentType: BrokerBAssignmentType.INTERNAL_USER,
        internalUserId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('assign rejects invalid target combo before loading transaction', async () => {
    usersRepo.findOne.mockResolvedValue({
      id: coordinatorAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    await expect(
      service.assign(coordinatorAuth, 't1', {
        assignmentType: BrokerBAssignmentType.INTERNAL_USER,
        internalUserId: '550e8400-e29b-41d4-a716-446655440000',
        externalContactId: '660e8400-e29b-41d4-a716-446655440001',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(txRepo.findOne).not.toHaveBeenCalled();
  });

  it('assign rejects when transaction not owned', async () => {
    usersRepo.findOne.mockResolvedValue({
      id: coordinatorAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    txRepo.findOne.mockResolvedValue(
      Object.assign(new Transaction(), {
        id: 't1',
        coordinatorId: 'other',
        status: TransactionStatus.AWAITING_BROKER_B,
      }),
    );

    await expect(
      service.assign(coordinatorAuth, 't1', {
        assignmentType: BrokerBAssignmentType.INTERNAL_USER,
        internalUserId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('assign rejects finalized transactions', async () => {
    usersRepo.findOne.mockResolvedValue({
      id: coordinatorAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    const tx = awaitingTx();
    tx.status = TransactionStatus.COMPLETED;
    txRepo.findOne.mockResolvedValue(tx);

    await expect(
      service.assign(coordinatorAuth, 't1', {
        assignmentType: BrokerBAssignmentType.INTERNAL_USER,
        internalUserId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assign rejects when status is not awaiting Broker B', async () => {
    usersRepo.findOne.mockResolvedValue({
      id: coordinatorAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    const tx = awaitingTx();
    tx.status = TransactionStatus.PENDING;
    txRepo.findOne.mockResolvedValue(tx);

    await expect(
      service.assign(coordinatorAuth, 't1', {
        assignmentType: BrokerBAssignmentType.INTERNAL_USER,
        internalUserId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assign rejects when an assigned row already exists', async () => {
    usersRepo.findOne.mockResolvedValue({
      id: coordinatorAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    txRepo.findOne.mockResolvedValue(awaitingTx());
    assignRepo.findOne.mockResolvedValue(
      Object.assign(new TransactionBrokerBAssignment(), {
        id: 'a1',
        assignmentStatus: BrokerBAssignmentStatus.ASSIGNED,
      }),
    );

    await expect(
      service.assign(coordinatorAuth, 't1', {
        assignmentType: BrokerBAssignmentType.INTERNAL_USER,
        internalUserId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assign rejects internal target that is not broker_b role', async () => {
    usersRepo.findOne
      .mockResolvedValueOnce({
        id: coordinatorAuth.userId,
        role: UserRole.COORDINATOR_SENDER,
        accountStatus: AccountStatus.ACTIVE,
      } as User)
      .mockResolvedValueOnce({
        id: 'b1',
        role: UserRole.BROKER_A,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

    txRepo.findOne.mockResolvedValue(awaitingTx());
    assignRepo.findOne.mockResolvedValue(null);

    await expect(
      service.assign(coordinatorAuth, 't1', {
        assignmentType: BrokerBAssignmentType.INTERNAL_USER,
        internalUserId: '550e8400-e29b-41d4-a716-446655440000',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('assign persists internal Broker B assignment', async () => {
    const brokerId = '550e8400-e29b-41d4-a716-446655440000';

    usersRepo.findOne
      .mockResolvedValueOnce({
        id: coordinatorAuth.userId,
        role: UserRole.COORDINATOR_SENDER,
        accountStatus: AccountStatus.ACTIVE,
      } as User)
      .mockResolvedValueOnce({
        id: brokerId,
        role: UserRole.BROKER_B,
        accountStatus: AccountStatus.ACTIVE,
      } as User);

    txRepo.findOne.mockResolvedValue(awaitingTx());
    assignRepo.findOne.mockResolvedValue(null);

    const out = await service.assign(coordinatorAuth, 't1', {
      assignmentType: BrokerBAssignmentType.INTERNAL_USER,
      internalUserId: brokerId,
    });

    expect(out.assignment_type).toBe(BrokerBAssignmentType.INTERNAL_USER);
    expect(out.internal_user_id).toBe(brokerId);
    expect(out.external_contact_id).toBeNull();
    expect(out.assignment_status).toBe(BrokerBAssignmentStatus.ASSIGNED);
    expect(assignRepo.save).toHaveBeenCalled();
  });

  it('assign persists external contact assignment', async () => {
    const contactId = '660e8400-e29b-41d4-a716-446655440001';

    usersRepo.findOne.mockResolvedValue({
      id: coordinatorAuth.userId,
      role: UserRole.COORDINATOR_SENDER,
      accountStatus: AccountStatus.ACTIVE,
    } as User);

    txRepo.findOne.mockResolvedValue(awaitingTx());
    assignRepo.findOne.mockResolvedValue(null);
    extRepo.findOne.mockResolvedValue(
      Object.assign(new ExternalContact(), { id: contactId }),
    );

    const out = await service.assign(coordinatorAuth, 't1', {
      assignmentType: BrokerBAssignmentType.EXTERNAL_CONTACT,
      externalContactId: contactId,
    });

    expect(out.assignment_type).toBe(BrokerBAssignmentType.EXTERNAL_CONTACT);
    expect(out.external_contact_id).toBe(contactId);
    expect(out.internal_user_id).toBeNull();
    expect(assignRepo.save).toHaveBeenCalled();
  });
});
