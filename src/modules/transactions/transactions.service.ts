import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Brackets, DataSource, In, IsNull, Repository } from 'typeorm';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { BrokerBAssignmentStatus } from '../../common/enums/broker-b-assignment-status.enum';
import { BrokerBAssignmentType } from '../../common/enums/broker-b-assignment-type.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { User } from '../users/entities/user.entity';
import { UserProfile } from '../users/entities/user-profile.entity';
import { RecipientsRepository } from '../recipients/recipients.repository';
import { assertTransactionAwaitingBrokerBDeliveryConfirmation } from './broker-b-delivery.rules';
import { assertMajorWorkflowFieldsUnlocked } from './transaction-workflow-lock.rules';
import { BrokerADeclineDto } from './dto/broker-a-decline.dto';
import { BrokerALocalAgentDetailsDto } from './dto/broker-a-local-agent-details.dto';
import { BrokerBConfirmDeliveryDto } from './dto/broker-b-confirm-delivery.dto';
import { SubmitTransactionDto } from './dto/submit-transaction.dto';
import { RecipientFeedback } from '../recipient-feedback/entities/recipient-feedback.entity';
import { BrokerALocalAgentDetail } from './entities/broker-a-local-agent-detail.entity';
import { CoordinatorAffirmation } from './entities/coordinator-affirmation.entity';
import { TransactionAuthCode } from './entities/transaction-auth-code.entity';
import { TransactionBrokerBAssignment } from './entities/transaction-broker-b-assignment.entity';
import { TransactionStatusHistory } from './entities/transaction-status-history.entity';
import { Transaction } from './entities/transaction.entity';
import { TransactionWorkflowHooks } from './transaction-workflow.hooks';

/** Stages where an internal Broker B assignment is visible (TB-054 / US-BB-001). */
const BROKER_B_VISIBLE_TRANSACTION_STATUSES: TransactionStatus[] = [
  TransactionStatus.AWAITING_BROKER_B,
  TransactionStatus.BROKER_B_ACCEPTED,
  TransactionStatus.BROKER_B_DECLINED,
  TransactionStatus.DELIVERED,
  TransactionStatus.FEEDBACK_SUBMITTED,
  TransactionStatus.COMPLETED,
];

const BROKER_B_OPEN_ASSIGNMENT_STATUSES: BrokerBAssignmentStatus[] = [
  BrokerBAssignmentStatus.ASSIGNED,
  BrokerBAssignmentStatus.ACCEPTED,
];

export type TransactionStatusHistoryView = {
  id: string;
  from_status: TransactionStatus | null;
  to_status: TransactionStatus;
  changed_by_user_id: string | null;
  change_reason: string | null;
  created_at: Date;
};

export type TransactionSummaryView = {
  id: string;
  coordinator_id: string;
  recipient_id: string;
  broker_a_user_id: string;
  status: TransactionStatus;
  amount: string;
  currency: string;
  submitted_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type RecipientFeedbackDetailView = {
  feedback_comment: string | null;
  actual_amount_received: string;
  submitted_at: Date;
};

export type CoordinatorAffirmationDetailView = {
  coordinator_comment: string | null;
  affirmed_at: Date;
};

export type TransactionDetailView = TransactionSummaryView & {
  transfer_method: string;
  verification_method: string;
  description: string | null;
  current_stage: string | null;
  delivery_confirmed_at: Date | null;
  completed_at: Date | null;
  status_history: TransactionStatusHistoryView[];
  recipient_feedback: RecipientFeedbackDetailView | null;
  coordinator_affirmation: CoordinatorAffirmationDetailView | null;
};

/** Active Broker A account row for coordinator transaction creation (snake_case JSON). */
export type EligibleBrokerAPublicView = {
  id: string;
  first_name: string;
  last_name: string;
  location: string | null;
  whatsapp_number: string | null;
  email: string;
  successful_transactions_count: number;
};

export type PaginatedEligibleBrokerAView = {
  items: EligibleBrokerAPublicView[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

@Injectable()
export class TransactionsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(TransactionStatusHistory)
    private readonly statusHistory: Repository<TransactionStatusHistory>,
    @InjectRepository(TransactionBrokerBAssignment)
    private readonly brokerBAssignments: Repository<TransactionBrokerBAssignment>,
    @InjectRepository(RecipientFeedback)
    private readonly recipientFeedback: Repository<RecipientFeedback>,
    @InjectRepository(CoordinatorAffirmation)
    private readonly coordinatorAffirmations: Repository<CoordinatorAffirmation>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly recipients: RecipientsRepository,
    private readonly config: ConfigService,
    private readonly workflowHooks: TransactionWorkflowHooks,
  ) {}

  private assertFundsAccess(actor: User): void {
    if (actor.role !== UserRole.COORDINATOR_SENDER) {
      throw new ForbiddenException(
        'Only a coordinator/sender may manage funds.',
      );
    }
    if (actor.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Account is not approved for this action.');
    }
  }

  private escapeIlikePattern(raw: string): string {
    return raw.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  private formatBrokerLocation(
    profile: UserProfile | undefined,
  ): string | null {
    if (!profile) {
      return null;
    }
    const parts = [
      profile.country?.trim(),
      profile.stateProvince?.trim(),
      profile.cityTown?.trim(),
    ].filter((p): p is string => Boolean(p && p.length > 0));
    return parts.length ? parts.join(' ') : null;
  }

  private async completedTransactionCountByBrokerIds(
    brokerUserIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (brokerUserIds.length === 0) {
      return map;
    }
    const rows = await this.transactions
      .createQueryBuilder('t')
      .select('t.brokerAUserId', 'brokerId')
      .addSelect('COUNT(t.id)', 'cnt')
      .where('t.brokerAUserId IN (:...ids)', { ids: brokerUserIds })
      .andWhere('t.status = :st', { st: TransactionStatus.COMPLETED })
      .groupBy('t.brokerAUserId')
      .getRawMany<{ brokerId: string; cnt: string }>();
    for (const row of rows) {
      map.set(row.brokerId, Number.parseInt(row.cnt, 10));
    }
    return map;
  }

  /**
   * Paginated list of active Broker A users for coordinator transaction intake (search + profile + completed tx count).
   */
  async listEligibleBrokerA(
    authUser: AuthenticatedUser,
    options?: { q?: string; limit?: number; page?: number },
  ): Promise<PaginatedEligibleBrokerAView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertFundsAccess(actor);

    const take = Math.min(Math.max(options?.limit ?? 10, 1), 50);
    const page = Math.max(options?.page ?? 1, 1);
    const offset = (page - 1) * take;

    const qRaw = typeof options?.q === 'string' ? options.q.trim() : '';
    const useFilter = qRaw.length >= 2;

    let base = this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.profile', 'p')
      .where('u.role = :role', { role: UserRole.BROKER_A })
      .andWhere('u.accountStatus = :act', { act: AccountStatus.ACTIVE });

    if (useFilter) {
      const pattern = `%${this.escapeIlikePattern(qRaw)}%`;
      base = base.andWhere(
        new Brackets((qb) => {
          qb.where("u.firstName ILIKE :pattern ESCAPE '\\'", { pattern })
            .orWhere("u.lastName ILIKE :pattern ESCAPE '\\'", { pattern })
            .orWhere("u.email ILIKE :pattern ESCAPE '\\'", { pattern })
            .orWhere("p.phoneNumber ILIKE :pattern ESCAPE '\\'", { pattern })
            .orWhere("p.contactPhoneE164 ILIKE :pattern ESCAPE '\\'", {
              pattern,
            });
        }),
      );
    }

    const total = await base.clone().getCount();
    const rows = await base
      .orderBy('u.lastName', 'ASC')
      .addOrderBy('u.firstName', 'ASC')
      .skip(offset)
      .take(take)
      .getMany();

    const countMap = await this.completedTransactionCountByBrokerIds(
      rows.map((r) => r.id),
    );

    const items: EligibleBrokerAPublicView[] = rows.map((u) => {
      const p = u.profile;
      return {
        id: u.id,
        first_name: u.firstName,
        last_name: u.lastName,
        location: this.formatBrokerLocation(p),
        whatsapp_number: null,
        email: u.email,
        successful_transactions_count: countMap.get(u.id) ?? 0,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / take));

    return {
      items,
      total,
      page,
      limit: take,
      totalPages,
    };
  }

  /** Explicit Broker A read gate: role + active account (mirrors coordinator funds checks). */
  private assertBrokerAReadAccess(actor: User): void {
    if (actor.role !== UserRole.BROKER_A) {
      throw new ForbiddenException(
        'Only Broker A may view assigned transactions.',
      );
    }
    if (actor.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Account is not approved for this action.');
    }
  }

  /** Internal Broker B read gate (permissions model §7.2). */
  private assertBrokerBReadAccess(actor: User): void {
    if (actor.role !== UserRole.BROKER_B) {
      throw new ForbiddenException(
        'Only Broker B may view assigned transactions.',
      );
    }
    if (actor.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Account is not approved for this action.');
    }
  }

  private isBrokerADeclineReasonRequired(): boolean {
    return this.config.get<boolean>(
      'transactionWorkflow.brokerADeclineReasonRequired',
      false,
    );
  }

  private normalizeDeclineReason(dto?: BrokerADeclineDto): string | null {
    const raw = dto?.reason?.trim();
    return raw && raw.length > 0 ? raw : null;
  }

  private toHistoryView(
    row: TransactionStatusHistory,
  ): TransactionStatusHistoryView {
    return {
      id: row.id,
      from_status: row.fromStatus,
      to_status: row.toStatus,
      changed_by_user_id: row.changedByUserId,
      change_reason: row.changeReason,
      created_at: row.createdAt,
    };
  }

  private toSummary(tx: Transaction): TransactionSummaryView {
    return {
      id: tx.id,
      coordinator_id: tx.coordinatorId,
      recipient_id: tx.recipientId,
      broker_a_user_id: tx.brokerAUserId,
      status: tx.status,
      amount: tx.amount,
      currency: tx.currency,
      submitted_at: tx.submittedAt,
      created_at: tx.createdAt,
      updated_at: tx.updatedAt,
    };
  }

  private toDetail(
    tx: Transaction,
    history: TransactionStatusHistory[],
    extras?: {
      recipientFeedback: RecipientFeedback | null;
      coordinatorAffirmation: CoordinatorAffirmation | null;
    },
  ): TransactionDetailView {
    const rf = extras?.recipientFeedback;
    const ca = extras?.coordinatorAffirmation;
    return {
      ...this.toSummary(tx),
      transfer_method: tx.transferMethod,
      verification_method: tx.verificationMethod,
      description: tx.description,
      current_stage: tx.currentStage,
      delivery_confirmed_at: tx.deliveryConfirmedAt,
      completed_at: tx.completedAt,
      status_history: history.map((h) => this.toHistoryView(h)),
      recipient_feedback: rf
        ? {
            feedback_comment: rf.feedbackComment,
            actual_amount_received: rf.actualAmountReceived,
            submitted_at: rf.submittedAt,
          }
        : null,
      coordinator_affirmation: ca
        ? {
            coordinator_comment: ca.coordinatorComment,
            affirmed_at: ca.affirmedAt,
          }
        : null,
    };
  }

  async submit(
    authUser: AuthenticatedUser,
    dto: SubmitTransactionDto,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertFundsAccess(actor);

    const recipient = await this.recipients.findEligibleForTransactionById(
      dto.recipientId,
    );
    if (!recipient) {
      throw new BadRequestException(
        'Recipient not found, inactive, or not eligible for transactions.',
      );
    }

    const brokerA = await this.users.findOne({
      where: { id: dto.brokerAUserId },
    });
    if (!brokerA) {
      throw new BadRequestException('Broker A user not found.');
    }
    if (brokerA.role !== UserRole.BROKER_A) {
      throw new BadRequestException(
        'Selected user is not an eligible Broker A.',
      );
    }
    if (brokerA.accountStatus !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Broker A account is not active.');
    }

    const coordinatorId = authUser.userId;
    const submittedAt = new Date();
    const currency = dto.currency ?? 'USD';
    const amountStr = dto.amount.toFixed(2);

    const detail = await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const histRepo = manager.getRepository(TransactionStatusHistory);

      const row = txRepo.create({
        coordinatorId,
        recipientId: dto.recipientId,
        brokerAUserId: dto.brokerAUserId,
        transferMethod: dto.transferMethod,
        verificationMethod: dto.verificationMethod,
        amount: amountStr,
        currency,
        description: dto.description ?? null,
        status: TransactionStatus.PENDING,
        currentStage: null,
        submittedAt,
        deliveryConfirmedAt: null,
        completedAt: null,
      });
      const saved = await txRepo.save(row);

      const hist = histRepo.create({
        transactionId: saved.id,
        fromStatus: null,
        toStatus: TransactionStatus.PENDING,
        changedByUserId: authUser.userId,
        changeReason: null,
        metadata: null,
      });
      await histRepo.save(hist);

      return this.toDetail(saved, [hist]);
    });

    return detail;
  }

  async listForCoordinator(
    authUser: AuthenticatedUser,
    options?: { offset?: number; limit?: number; status?: TransactionStatus },
  ): Promise<TransactionSummaryView[]> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertFundsAccess(actor);

    const take = Math.min(Math.max(options?.limit ?? 20, 1), 50);
    const skip = Math.max(options?.offset ?? 0, 0);

    const rows = await this.transactions.find({
      where: {
        coordinatorId: authUser.userId,
        ...(options?.status != null ? { status: options.status } : {}),
      },
      order: { submittedAt: 'DESC' },
      skip,
      take,
    });

    return rows.map((tx) => this.toSummary(tx));
  }

  async getDetailForCoordinator(
    authUser: AuthenticatedUser,
    id: string,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertFundsAccess(actor);

    const tx = await this.transactions.findOne({ where: { id } });
    if (!tx || tx.coordinatorId !== authUser.userId) {
      throw new NotFoundException('Transaction not found.');
    }

    const history = await this.statusHistory.find({
      where: { transactionId: tx.id },
      order: { createdAt: 'ASC' },
    });

    const feedback = await this.recipientFeedback.findOne({
      where: { transactionId: tx.id },
    });
    const affirmation = await this.coordinatorAffirmations.findOne({
      where: { transactionId: tx.id },
    });

    return this.toDetail(tx, history, {
      recipientFeedback: feedback,
      coordinatorAffirmation: affirmation,
    });
  }

  async getStatusHistoryForCoordinator(
    authUser: AuthenticatedUser,
    id: string,
  ): Promise<TransactionStatusHistoryView[]> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertFundsAccess(actor);

    const tx = await this.transactions.findOne({ where: { id } });
    if (!tx || tx.coordinatorId !== authUser.userId) {
      throw new NotFoundException('Transaction not found.');
    }

    const history = await this.statusHistory.find({
      where: { transactionId: tx.id },
      order: { createdAt: 'ASC' },
    });

    return history.map((h) => this.toHistoryView(h));
  }

  async listForBrokerA(
    authUser: AuthenticatedUser,
    options?: { offset?: number; limit?: number },
  ): Promise<TransactionSummaryView[]> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertBrokerAReadAccess(actor);

    const take = Math.min(Math.max(options?.limit ?? 20, 1), 50);
    const skip = Math.max(options?.offset ?? 0, 0);

    const rows = await this.transactions.find({
      where: { brokerAUserId: authUser.userId },
      order: { submittedAt: 'DESC' },
      skip,
      take,
    });

    return rows.map((tx) => this.toSummary(tx));
  }

  async getDetailForBrokerA(
    authUser: AuthenticatedUser,
    id: string,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertBrokerAReadAccess(actor);

    const tx = await this.transactions.findOne({ where: { id } });
    if (!tx || tx.brokerAUserId !== authUser.userId) {
      throw new NotFoundException('Transaction not found.');
    }

    const history = await this.statusHistory.find({
      where: { transactionId: tx.id },
      order: { createdAt: 'ASC' },
    });

    return this.toDetail(tx, history);
  }

  async listForBrokerB(
    authUser: AuthenticatedUser,
    options?: { offset?: number; limit?: number },
  ): Promise<TransactionSummaryView[]> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertBrokerBReadAccess(actor);

    const take = Math.min(Math.max(options?.limit ?? 20, 1), 50);
    const skip = Math.max(options?.offset ?? 0, 0);

    const rows = await this.transactions
      .createQueryBuilder('tx')
      .innerJoin(
        TransactionBrokerBAssignment,
        'bba',
        'bba.transaction_id = tx.id AND bba.internal_user_id = :bbUserId AND bba.assignment_type = :bbAssignmentType',
        {
          bbUserId: authUser.userId,
          bbAssignmentType: BrokerBAssignmentType.INTERNAL_USER,
        },
      )
      .where('bba.assignment_status IN (:...bbAssignmentStatuses)', {
        bbAssignmentStatuses: BROKER_B_OPEN_ASSIGNMENT_STATUSES,
      })
      .andWhere('tx.status IN (:...bbTxStatuses)', {
        bbTxStatuses: BROKER_B_VISIBLE_TRANSACTION_STATUSES,
      })
      .orderBy('tx.submitted_at', 'DESC')
      .skip(skip)
      .take(take)
      .getMany();

    return rows.map((tx) => this.toSummary(tx));
  }

  async getDetailForBrokerB(
    authUser: AuthenticatedUser,
    id: string,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertBrokerBReadAccess(actor);

    const tx = await this.transactions.findOne({ where: { id } });
    if (!tx) {
      throw new NotFoundException('Transaction not found.');
    }

    const assignment = await this.brokerBAssignments.findOne({
      where: {
        transactionId: id,
        internalUserId: authUser.userId,
        assignmentType: BrokerBAssignmentType.INTERNAL_USER,
        assignmentStatus: In(BROKER_B_OPEN_ASSIGNMENT_STATUSES),
      },
    });

    if (
      !assignment ||
      !BROKER_B_VISIBLE_TRANSACTION_STATUSES.includes(tx.status)
    ) {
      throw new NotFoundException('Transaction not found.');
    }

    const history = await this.statusHistory.find({
      where: { transactionId: tx.id },
      order: { createdAt: 'ASC' },
    });

    return this.toDetail(tx, history);
  }

  async brokerAAccept(
    authUser: AuthenticatedUser,
    transactionId: string,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertBrokerAReadAccess(actor);

    let savedForHook!: Transaction;
    const detail = await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const histRepo = manager.getRepository(TransactionStatusHistory);

      const row = await txRepo.findOne({
        where: { id: transactionId, brokerAUserId: authUser.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        throw new NotFoundException('Transaction not found.');
      }
      assertMajorWorkflowFieldsUnlocked(row);
      if (row.status !== TransactionStatus.PENDING) {
        throw new BadRequestException(
          'Only a pending transaction assigned to you can be accepted.',
        );
      }

      row.status = TransactionStatus.BROKER_A_ACCEPTED;
      const saved = await txRepo.save(row);
      savedForHook = saved;

      const hist = histRepo.create({
        transactionId: saved.id,
        fromStatus: TransactionStatus.PENDING,
        toStatus: TransactionStatus.BROKER_A_ACCEPTED,
        changedByUserId: authUser.userId,
        changeReason: null,
        metadata: null,
      });
      await histRepo.save(hist);

      const allHistory = await histRepo.find({
        where: { transactionId: saved.id },
        order: { createdAt: 'ASC' },
      });
      return this.toDetail(saved, allHistory);
    });

    await this.workflowHooks.onBrokerAAccepted(savedForHook);
    return detail;
  }

  async brokerADecline(
    authUser: AuthenticatedUser,
    transactionId: string,
    dto?: BrokerADeclineDto,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertBrokerAReadAccess(actor);

    const reason = this.normalizeDeclineReason(dto);
    if (this.isBrokerADeclineReasonRequired() && !reason) {
      throw new BadRequestException('Decline reason is required.');
    }

    let savedForHook!: Transaction;
    const detail = await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const histRepo = manager.getRepository(TransactionStatusHistory);

      const row = await txRepo.findOne({
        where: { id: transactionId, brokerAUserId: authUser.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        throw new NotFoundException('Transaction not found.');
      }
      assertMajorWorkflowFieldsUnlocked(row);
      if (row.status !== TransactionStatus.PENDING) {
        throw new BadRequestException(
          'Only a pending transaction assigned to you can be declined.',
        );
      }

      row.status = TransactionStatus.BROKER_A_DECLINED;
      const saved = await txRepo.save(row);
      savedForHook = saved;

      const hist = histRepo.create({
        transactionId: saved.id,
        fromStatus: TransactionStatus.PENDING,
        toStatus: TransactionStatus.BROKER_A_DECLINED,
        changedByUserId: authUser.userId,
        changeReason: reason,
        metadata: null,
      });
      await histRepo.save(hist);

      const allHistory = await histRepo.find({
        where: { transactionId: saved.id },
        order: { createdAt: 'ASC' },
      });
      return this.toDetail(saved, allHistory);
    });

    await this.workflowHooks.onBrokerADeclined(savedForHook, reason);
    return detail;
  }

  async brokerASubmitLocalAgentDetails(
    authUser: AuthenticatedUser,
    transactionId: string,
    dto: BrokerALocalAgentDetailsDto,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertBrokerAReadAccess(actor);

    const forwardingStr = dto.forwardingValue.toFixed(2);
    let savedForHook!: Transaction;

    const detail = await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const histRepo = manager.getRepository(TransactionStatusHistory);
      const detailRepo = manager.getRepository(BrokerALocalAgentDetail);

      const row = await txRepo.findOne({
        where: { id: transactionId, brokerAUserId: authUser.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        throw new NotFoundException('Transaction not found.');
      }
      assertMajorWorkflowFieldsUnlocked(row);
      if (row.status !== TransactionStatus.BROKER_A_ACCEPTED) {
        throw new BadRequestException(
          'Local agent details can only be submitted after acceptance and while the transaction is awaiting your forwarding details.',
        );
      }

      const existing = await detailRepo.findOne({
        where: { transactionId: row.id },
      });
      if (existing) {
        throw new BadRequestException(
          'Local agent details have already been submitted for this transaction.',
        );
      }

      const submittedAt = new Date();
      const detailRow = detailRepo.create({
        transactionId: row.id,
        organizationName: dto.organizationName,
        forwardingValue: forwardingStr,
        localAgentName: dto.localAgentName,
        localAgentPhone: dto.localAgentPhone,
        coordinationMethod: dto.coordinationMethod,
        submittedBy: authUser.userId,
        submittedAt,
      });
      await detailRepo.save(detailRow);

      row.status = TransactionStatus.AWAITING_BROKER_B;
      const saved = await txRepo.save(row);
      savedForHook = saved;

      const hist = histRepo.create({
        transactionId: saved.id,
        fromStatus: TransactionStatus.BROKER_A_ACCEPTED,
        toStatus: TransactionStatus.AWAITING_BROKER_B,
        changedByUserId: authUser.userId,
        changeReason: null,
        metadata: null,
      });
      await histRepo.save(hist);

      const allHistory = await histRepo.find({
        where: { transactionId: saved.id },
        order: { createdAt: 'ASC' },
      });
      return this.toDetail(saved, allHistory);
    });

    await this.workflowHooks.onBrokerAReadyForBrokerB(savedForHook);
    return detail;
  }

  async brokerBConfirmDelivery(
    authUser: AuthenticatedUser,
    transactionId: string,
    dto: BrokerBConfirmDeliveryDto,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertBrokerBReadAccess(actor);

    const plainCode = dto.code.trim();
    if (!plainCode) {
      throw new BadRequestException('Invalid or expired delivery code.');
    }

    let savedForHook!: Transaction;

    const detail = await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);

      const row = await txRepo.findOne({
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        throw new NotFoundException('Transaction not found.');
      }
      assertMajorWorkflowFieldsUnlocked(row);

      const assignRepo = manager.getRepository(TransactionBrokerBAssignment);
      const assignment = await assignRepo.findOne({
        where: {
          transactionId: row.id,
          internalUserId: authUser.userId,
          assignmentType: BrokerBAssignmentType.INTERNAL_USER,
          assignmentStatus: BrokerBAssignmentStatus.ACCEPTED,
        },
      });
      if (!assignment) {
        throw new NotFoundException('Transaction not found.');
      }

      assertTransactionAwaitingBrokerBDeliveryConfirmation(row);

      const codeRepo = manager.getRepository(TransactionAuthCode);
      const activeCode = await codeRepo.findOne({
        where: {
          transactionId: row.id,
          brokerBAssignmentId: assignment.id,
          invalidatedAt: IsNull(),
          verifiedAt: IsNull(),
        },
        order: { issuedAt: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });

      if (!activeCode || activeCode.recipientId !== row.recipientId) {
        throw new BadRequestException('Invalid or expired delivery code.');
      }

      if (activeCode.expiresAt.getTime() <= Date.now()) {
        throw new BadRequestException('Invalid or expired delivery code.');
      }

      const match = await bcrypt.compare(plainCode, activeCode.codeHash);
      if (!match) {
        throw new BadRequestException('Invalid or expired delivery code.');
      }

      activeCode.verifiedAt = new Date();
      await codeRepo.save(activeCode);

      row.status = TransactionStatus.DELIVERED;
      row.deliveryConfirmedAt = new Date();
      const saved = await txRepo.save(row);
      savedForHook = saved;

      const histRepo = manager.getRepository(TransactionStatusHistory);
      const hist = histRepo.create({
        transactionId: saved.id,
        fromStatus: TransactionStatus.BROKER_B_ACCEPTED,
        toStatus: TransactionStatus.DELIVERED,
        changedByUserId: authUser.userId,
        changeReason: null,
        metadata: null,
      });
      await histRepo.save(hist);

      const allHistory = await histRepo.find({
        where: { transactionId: saved.id },
        order: { createdAt: 'ASC' },
      });
      return this.toDetail(saved, allHistory);
    });

    await this.workflowHooks.onBrokerBDeliveryConfirmed(savedForHook);
    return detail;
  }
}
