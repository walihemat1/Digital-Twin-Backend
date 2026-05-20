import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
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
import {
  assertBrokerBCanAcceptAssignment,
  assertBrokerBCanDeclineAssignment,
  assertTransactionAwaitingBrokerBDeliveryConfirmation,
} from './broker-b-delivery.rules';
import { NotificationDeliveryStatus } from '../../common/enums/notification-delivery-status.enum';
import { assertMajorWorkflowFieldsUnlocked } from './transaction-workflow-lock.rules';
import { generateSixDigitMfaCode } from '../auth/crypto/opaque-token.util';
import { BrokerADeclineDto } from './dto/broker-a-decline.dto';
import { BrokerAAssignBrokerBDto } from './dto/broker-a-assign-broker-b.dto';
import { BrokerALocalAgentDetailsDto } from './dto/broker-a-local-agent-details.dto';
import { BrokerBConfirmDeliveryDto } from './dto/broker-b-confirm-delivery.dto';
import { BrokerBDeclineDto } from './dto/broker-b-decline.dto';
import { CoordinatorChangeBrokerADto } from './dto/coordinator-change-broker-a.dto';
import { CoordinatorChangeRecipientDto } from './dto/coordinator-change-recipient.dto';
import { SubmitTransactionDto } from './dto/submit-transaction.dto';
import { RecipientFeedback } from '../recipient-feedback/entities/recipient-feedback.entity';
import { Recipient } from '../recipients/entities/recipient.entity';
import { BrokerALocalAgentDetail } from './entities/broker-a-local-agent-detail.entity';
import { TransactionDeliveryVerificationAttempt } from './entities/transaction-delivery-verification-attempt.entity';
import { DeliveryAuthCodeCryptoService } from './delivery-auth-code-crypto.service';
import { TransactionWorkflowNotificationService } from './transaction-workflow-notification.service';
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
  /** Present when `recipient` relation was loaded. */
  recipient_first_name?: string;
  recipient_last_name?: string;
  /** E.164 or stored dial string from `recipients.normalized_phone` / `phone_number`. */
  recipient_phone_number?: string;
  /** Present when `coordinator` relation was loaded (Broker B list/detail). */
  coordinator_first_name?: string;
  coordinator_last_name?: string;
  /** Present when `brokerAUser` relation was loaded (coordinator detail). */
  broker_a_first_name?: string;
  broker_a_last_name?: string;
  /** Present when Broker B assignment user/contact was resolved (coordinator detail). */
  broker_b_first_name?: string;
  broker_b_last_name?: string;
  /** Present on summaries built from a full `Transaction` row. */
  transfer_method?: string;
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

/** Caller's Broker B assignment on detail reads (`transaction_broker_b_assignments`). */
export type BrokerBAssignmentDetailView = {
  id: string;
  transaction_id: string;
  assignment_type: BrokerBAssignmentType;
  internal_user_id: string | null;
  external_contact_id: string | null;
  assignment_status: BrokerBAssignmentStatus;
  assigned_at: Date;
  responded_at: Date | null;
  decline_reason: string | null;
  created_at: Date;
  updated_at: Date;
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
  broker_b_assignment: BrokerBAssignmentDetailView | null;
  /** Present for assigned Broker B while an active unverified auth code exists. */
  delivery_auth_code?: string | null;
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

/** Active Broker B account row for Broker A forwarding selection (snake_case JSON). */
export type EligibleBrokerBPublicView = {
  id: string;
  first_name: string;
  last_name: string;
  location: string | null;
  phone_number: string | null;
  email: string;
};

export type PaginatedEligibleBrokerBView = {
  items: EligibleBrokerBPublicView[];
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
    @InjectRepository(TransactionAuthCode)
    private readonly authCodes: Repository<TransactionAuthCode>,
    @InjectRepository(Recipient)
    private readonly recipientEntities: Repository<Recipient>,
    private readonly recipients: RecipientsRepository,
    private readonly config: ConfigService,
    private readonly workflowHooks: TransactionWorkflowHooks,
    private readonly deliveryAuthCodeCrypto: DeliveryAuthCodeCryptoService,
    private readonly workflowNotifications: TransactionWorkflowNotificationService,
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

  /**
   * Paginated list of active Broker B users for Broker A local-agent / forwarding selection.
   */
  async listEligibleBrokerB(
    authUser: AuthenticatedUser,
    options?: { q?: string; limit?: number; page?: number },
  ): Promise<PaginatedEligibleBrokerBView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertBrokerAReadAccess(actor);

    const take = Math.min(Math.max(options?.limit ?? 10, 1), 50);
    const page = Math.max(options?.page ?? 1, 1);
    const offset = (page - 1) * take;

    const qRaw = typeof options?.q === 'string' ? options.q.trim() : '';
    const useFilter = qRaw.length >= 2;

    let base = this.users
      .createQueryBuilder('u')
      .leftJoinAndSelect('u.profile', 'p')
      .where('u.role = :role', { role: UserRole.BROKER_B })
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

    const items: EligibleBrokerBPublicView[] = rows.map((u) => {
      const p = u.profile;
      const phone =
        (typeof p?.contactPhoneE164 === 'string' && p.contactPhoneE164.trim() !== ''
          ? p.contactPhoneE164.trim()
          : null) ??
        (typeof p?.phoneNumber === 'string' && p.phoneNumber.trim() !== ''
          ? p.phoneNumber.trim()
          : null);
      return {
        id: u.id,
        first_name: u.firstName,
        last_name: u.lastName,
        location: this.formatBrokerLocation(p),
        phone_number: phone,
        email: u.email,
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

  private isBrokerBDeclineReasonRequired(): boolean {
    return this.config.get<boolean>(
      'transactionWorkflow.brokerBDeclineReasonRequired',
      false,
    );
  }

  private get bcryptSaltRounds(): number {
    return this.config.get<number>('auth.bcryptSaltRounds', 12);
  }

  private brokerBDeliveryAuthCodeTtlMs(): number {
    const minutes = this.config.get<number>(
      'transactionWorkflow.brokerBDeliveryAuthCodeTtlMinutes',
      60 * 24,
    );
    const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : 60 * 24;
    return safe * 60 * 1000;
  }

  private brokerBDeliveryVerificationMaxAttempts(): number {
    const n = this.config.get<number>(
      'transactionWorkflow.brokerBDeliveryVerificationMaxAttempts',
      5,
    );
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 5;
  }

  private brokerBDeliveryVerificationWindowMs(): number {
    const minutes = this.config.get<number>(
      'transactionWorkflow.brokerBDeliveryVerificationWindowMinutes',
      60,
    );
    const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
    return safe * 60 * 1000;
  }

  private amountsMatch(expected: string, received: number): boolean {
    const expectedNum = Number.parseFloat(expected);
    const receivedNum = Number(received);
    if (!Number.isFinite(expectedNum) || !Number.isFinite(receivedNum)) {
      return false;
    }
    return expectedNum.toFixed(2) === receivedNum.toFixed(2);
  }

  private async resolveDeliveryAuthCodeForBrokerB(
    transactionId: string,
    brokerBAssignmentId: string,
  ): Promise<string | null> {
    const activeCode = await this.authCodes.findOne({
      where: {
        transactionId,
        brokerBAssignmentId,
        invalidatedAt: IsNull(),
        verifiedAt: IsNull(),
      },
      order: { issuedAt: 'DESC' },
    });
    if (
      !activeCode?.codeEncrypted ||
      activeCode.expiresAt.getTime() <= Date.now()
    ) {
      return null;
    }
    try {
      return this.deliveryAuthCodeCrypto.decrypt(activeCode.codeEncrypted);
    } catch {
      return null;
    }
  }

  private async assertDeliveryVerificationNotRateLimited(
    transactionId: string,
    brokerBUserId: string,
    manager: import('typeorm').EntityManager,
  ): Promise<void> {
    const attemptRepo = manager.getRepository(
      TransactionDeliveryVerificationAttempt,
    );
    const windowStart = new Date(
      Date.now() - this.brokerBDeliveryVerificationWindowMs(),
    );
    const count = await attemptRepo
      .createQueryBuilder('a')
      .where('a.transaction_id = :transactionId', { transactionId })
      .andWhere('a.broker_b_user_id = :brokerBUserId', { brokerBUserId })
      .andWhere('a.created_at >= :windowStart', { windowStart })
      .getCount();

    if (count >= this.brokerBDeliveryVerificationMaxAttempts()) {
      throw new HttpException(
        {
          code: 'rate_limited',
          message: 'Too many delivery verification attempts. Try again later.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async recordDeliveryVerificationFailure(
    manager: import('typeorm').EntityManager,
    transactionId: string,
    brokerBUserId: string,
    failureReason: string,
    codeValid: boolean | null,
    amountValid: boolean | null,
  ): Promise<void> {
    const attemptRepo = manager.getRepository(
      TransactionDeliveryVerificationAttempt,
    );
    await attemptRepo.save(
      attemptRepo.create({
        transactionId,
        brokerBUserId,
        failureReason,
        codeValid,
        amountValid,
      }),
    );
  }

  private normalizeDeclineReason(dto?: BrokerADeclineDto): string | null {
    const raw = dto?.reason?.trim();
    return raw && raw.length > 0 ? raw : null;
  }

  private normalizeBrokerBDeclineReason(dto?: BrokerBDeclineDto): string | null {
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

  private brokerBAssignmentDisplayNames(
    assignment: TransactionBrokerBAssignment | null | undefined,
  ): Pick<
    TransactionSummaryView,
    'broker_b_first_name' | 'broker_b_last_name'
  > {
    if (assignment == null) {
      return {};
    }
    const internal = assignment.internalUser;
    if (internal != null) {
      return {
        broker_b_first_name: internal.firstName,
        broker_b_last_name: internal.lastName,
      };
    }
    const external = assignment.externalContact;
    if (external != null) {
      const display = external.displayName?.trim() ?? '';
      if (display !== '') {
        return { broker_b_first_name: display, broker_b_last_name: '' };
      }
    }
    return {};
  }

  private toSummary(tx: Transaction): TransactionSummaryView {
    const recipient = tx.recipient;
    const coordinator = tx.coordinator;
    const brokerA = tx.brokerAUser;
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
      transfer_method: tx.transferMethod,
      ...(recipient != null
        ? {
            recipient_first_name: recipient.firstName,
            recipient_last_name: recipient.lastName,
            recipient_phone_number:
              recipient.normalizedPhone?.trim() ||
              recipient.phoneNumber?.trim() ||
              undefined,
          }
        : {}),
      ...(coordinator != null
        ? {
            coordinator_first_name: coordinator.firstName,
            coordinator_last_name: coordinator.lastName,
          }
        : {}),
      ...(brokerA != null
        ? {
            broker_a_first_name: brokerA.firstName,
            broker_a_last_name: brokerA.lastName,
          }
        : {}),
    };
  }

  private toBrokerBAssignmentDetailView(
    row: TransactionBrokerBAssignment,
  ): BrokerBAssignmentDetailView {
    return {
      id: row.id,
      transaction_id: row.transactionId,
      assignment_type: row.assignmentType,
      internal_user_id: row.internalUserId,
      external_contact_id: row.externalContactId,
      assignment_status: row.assignmentStatus,
      assigned_at: row.assignedAt,
      responded_at: row.respondedAt,
      decline_reason: row.declineReason,
      created_at: row.createdAt,
      updated_at: row.updatedAt,
    };
  }

  private toDetail(
    tx: Transaction,
    history: TransactionStatusHistory[],
    extras?: {
      recipientFeedback?: RecipientFeedback | null;
      coordinatorAffirmation?: CoordinatorAffirmation | null;
      brokerBAssignment?: TransactionBrokerBAssignment | null;
      deliveryAuthCode?: string | null;
    },
  ): TransactionDetailView {
    const rf = extras?.recipientFeedback;
    const ca = extras?.coordinatorAffirmation;
    const bba = extras?.brokerBAssignment;
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
      broker_b_assignment: bba ? this.toBrokerBAssignmentDetailView(bba) : null,
      ...(extras?.deliveryAuthCode !== undefined
        ? { delivery_auth_code: extras.deliveryAuthCode }
        : {}),
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

    const recipient = await this.recipients.findEligibleForTransactionForUser(
      dto.recipientId,
      { mode: 'user', userId: authUser.userId },
    );
    if (!recipient) {
      throw new BadRequestException(
        'Recipient not found, inactive, not visible to your account, or not eligible for transactions.',
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
      relations: ['recipient'],
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

    const tx = await this.transactions.findOne({
      where: { id },
      relations: ['recipient', 'brokerAUser'],
    });
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

    const brokerBAssignments = await this.brokerBAssignments.find({
      where: { transactionId: tx.id },
      relations: ['internalUser', 'externalContact'],
      order: { assignedAt: 'DESC' },
      take: 1,
    });
    const brokerBAssignment = brokerBAssignments[0] ?? null;

    const detail = this.toDetail(tx, history, {
      recipientFeedback: feedback,
      coordinatorAffirmation: affirmation,
      brokerBAssignment,
    });

    return {
      ...detail,
      ...this.brokerBAssignmentDisplayNames(brokerBAssignment),
    };
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
      relations: ['recipient', 'coordinator'],
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

    const tx = await this.transactions.findOne({
      where: { id },
      relations: ['recipient', 'coordinator'],
    });
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
      .leftJoinAndSelect('tx.recipient', 'recipient')
      .leftJoinAndSelect('tx.coordinator', 'coordinator')
      .where('bba.assignment_status IN (:...bbAssignmentStatuses)', {
        bbAssignmentStatuses: BROKER_B_OPEN_ASSIGNMENT_STATUSES,
      })
      .andWhere('tx.status IN (:...bbTxStatuses)', {
        bbTxStatuses: BROKER_B_VISIBLE_TRANSACTION_STATUSES,
      })
      .orderBy('tx.submittedAt', 'DESC')
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

    const tx = await this.transactions.findOne({
      where: { id },
      relations: ['recipient', 'coordinator'],
    });
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

    const deliveryAuthCode = await this.resolveDeliveryAuthCodeForBrokerB(
      tx.id,
      assignment.id,
    );

    return this.toDetail(tx, history, {
      brokerBAssignment: assignment,
      deliveryAuthCode,
    });
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

  /**
   * @deprecated Use `brokerAAssignBrokerB`. Kept as a thin alias for older clients.
   */
  async brokerASubmitLocalAgentDetails(
    authUser: AuthenticatedUser,
    transactionId: string,
    dto: BrokerALocalAgentDetailsDto,
  ): Promise<TransactionDetailView> {
    return this.brokerAAssignBrokerB(authUser, transactionId, {
      internalUserId: dto.internalUserId,
    });
  }

  async brokerAAssignBrokerB(
    authUser: AuthenticatedUser,
    transactionId: string,
    dto: BrokerAAssignBrokerBDto,
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
      const userRepo = manager.getRepository(User);
      const assignRepo = manager.getRepository(TransactionBrokerBAssignment);

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
          'Broker B can only be assigned after acceptance and while the transaction is awaiting assignment.',
        );
      }

      const existingAssignment = await assignRepo.findOne({
        where: {
          transactionId: row.id,
          assignmentStatus: BrokerBAssignmentStatus.ASSIGNED,
        },
      });
      if (existingAssignment) {
        throw new BadRequestException(
          'This transaction already has an active Broker B assignment.',
        );
      }

      const brokerB = await userRepo.findOne({
        where: { id: dto.internalUserId },
      });
      if (!brokerB) {
        throw new BadRequestException('Broker B user not found.');
      }
      if (brokerB.role !== UserRole.BROKER_B) {
        throw new BadRequestException('Selected user is not an eligible Broker B.');
      }
      if (brokerB.accountStatus !== AccountStatus.ACTIVE) {
        throw new BadRequestException('Broker B account is not active.');
      }

      const assignedAt = new Date();
      const assignmentRow = assignRepo.create({
        transactionId: row.id,
        assignmentType: BrokerBAssignmentType.INTERNAL_USER,
        internalUserId: brokerB.id,
        externalContactId: null,
        assignmentStatus: BrokerBAssignmentStatus.ASSIGNED,
        assignedAt,
        respondedAt: null,
        declineReason: null,
      });
      await assignRepo.save(assignmentRow);

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
      return this.toDetail(saved, allHistory, {
        brokerBAssignment: assignmentRow,
      });
    });

    await this.workflowHooks.onBrokerAReadyForBrokerB(savedForHook);
    return detail;
  }

  async brokerBAccept(
    authUser: AuthenticatedUser,
    transactionId: string,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertBrokerBReadAccess(actor);

    let savedForHook!: Transaction;
    let plainCodeForNotifications = '';
    let authCodeIdForSms = '';

    const detail = await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const histRepo = manager.getRepository(TransactionStatusHistory);
      const assignRepo = manager.getRepository(TransactionBrokerBAssignment);
      const codeRepo = manager.getRepository(TransactionAuthCode);

      const row = await txRepo.findOne({
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        throw new NotFoundException('Transaction not found.');
      }
      assertMajorWorkflowFieldsUnlocked(row);

      const assignment = await assignRepo.findOne({
        where: {
          transactionId: row.id,
          internalUserId: authUser.userId,
          assignmentType: BrokerBAssignmentType.INTERNAL_USER,
          assignmentStatus: BrokerBAssignmentStatus.ASSIGNED,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!assignment) {
        throw new NotFoundException('Transaction not found.');
      }

      assertBrokerBCanAcceptAssignment(row, assignment);

      const respondedAt = new Date();
      assignment.assignmentStatus = BrokerBAssignmentStatus.ACCEPTED;
      assignment.respondedAt = respondedAt;
      await assignRepo.save(assignment);

      await codeRepo.update(
        {
          transactionId: row.id,
          brokerBAssignmentId: assignment.id,
          invalidatedAt: IsNull(),
        },
        { invalidatedAt: respondedAt },
      );

      const plainCode = generateSixDigitMfaCode();
      plainCodeForNotifications = plainCode;
      const codeHash = await bcrypt.hash(plainCode, this.bcryptSaltRounds);
      const codeEncrypted = this.deliveryAuthCodeCrypto.encrypt(plainCode);
      const issuedAt = respondedAt;
      const expiresAt = new Date(issuedAt.getTime() + this.brokerBDeliveryAuthCodeTtlMs());

      const savedCode = await codeRepo.save(
        codeRepo.create({
          transactionId: row.id,
          recipientId: row.recipientId,
          brokerBAssignmentId: assignment.id,
          codeHash,
          codeEncrypted,
          issuedAt,
          expiresAt,
          invalidatedAt: null,
          verifiedAt: null,
          deliveryStatus: NotificationDeliveryStatus.PENDING,
        }),
      );
      authCodeIdForSms = savedCode.id;

      row.status = TransactionStatus.BROKER_B_ACCEPTED;
      const saved = await txRepo.save(row);
      savedForHook = saved;

      const hist = histRepo.create({
        transactionId: saved.id,
        fromStatus: TransactionStatus.AWAITING_BROKER_B,
        toStatus: TransactionStatus.BROKER_B_ACCEPTED,
        changedByUserId: authUser.userId,
        changeReason: null,
        metadata: null,
      });
      await histRepo.save(hist);

      const allHistory = await histRepo.find({
        where: { transactionId: saved.id },
        order: { createdAt: 'ASC' },
      });
      return this.toDetail(saved, allHistory, {
        brokerBAssignment: assignment,
        deliveryAuthCode: plainCode,
      });
    });

    const recipient = await this.recipientEntities.findOne({
      where: { id: savedForHook.recipientId },
    });
    if (recipient && plainCodeForNotifications) {
      await this.workflowNotifications.sendRecipientDeliveryAuthSms(
        savedForHook,
        recipient,
        plainCodeForNotifications,
        authCodeIdForSms,
      );
    }
    await this.workflowHooks.onBrokerBAccepted(
      savedForHook,
      plainCodeForNotifications,
    );
    return detail;
  }

  async brokerBDecline(
    authUser: AuthenticatedUser,
    transactionId: string,
    dto?: BrokerBDeclineDto,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertBrokerBReadAccess(actor);

    const reason = this.normalizeBrokerBDeclineReason(dto);
    if (this.isBrokerBDeclineReasonRequired() && !reason) {
      throw new BadRequestException('Decline reason is required.');
    }

    let savedForHook!: Transaction;

    const detail = await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const histRepo = manager.getRepository(TransactionStatusHistory);
      const assignRepo = manager.getRepository(TransactionBrokerBAssignment);

      const row = await txRepo.findOne({
        where: { id: transactionId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        throw new NotFoundException('Transaction not found.');
      }
      assertMajorWorkflowFieldsUnlocked(row);

      const assignment = await assignRepo.findOne({
        where: {
          transactionId: row.id,
          internalUserId: authUser.userId,
          assignmentType: BrokerBAssignmentType.INTERNAL_USER,
          assignmentStatus: BrokerBAssignmentStatus.ASSIGNED,
        },
        lock: { mode: 'pessimistic_write' },
      });
      if (!assignment) {
        throw new NotFoundException('Transaction not found.');
      }

      assertBrokerBCanDeclineAssignment(row, assignment);

      const respondedAt = new Date();
      assignment.assignmentStatus = BrokerBAssignmentStatus.DECLINED;
      assignment.respondedAt = respondedAt;
      assignment.declineReason = reason;
      await assignRepo.save(assignment);

      row.status = TransactionStatus.BROKER_B_DECLINED;
      const saved = await txRepo.save(row);
      savedForHook = saved;

      const hist = histRepo.create({
        transactionId: saved.id,
        fromStatus: TransactionStatus.AWAITING_BROKER_B,
        toStatus: TransactionStatus.BROKER_B_DECLINED,
        changedByUserId: authUser.userId,
        changeReason: reason,
        metadata: null,
      });
      await histRepo.save(hist);

      const allHistory = await histRepo.find({
        where: { transactionId: saved.id },
        order: { createdAt: 'ASC' },
      });
      return this.toDetail(saved, allHistory, {
        brokerBAssignment: assignment,
      });
    });

    await this.workflowHooks.onBrokerBDeclined(savedForHook, reason);
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
      throw new BadRequestException({
        code: 'invalid_code',
        message: 'Invalid or expired delivery code.',
      });
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

      await this.assertDeliveryVerificationNotRateLimited(
        row.id,
        authUser.userId,
        manager,
      );

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
        await this.recordDeliveryVerificationFailure(
          manager,
          row.id,
          authUser.userId,
          'invalid_code',
          false,
          null,
        );
        throw new BadRequestException({
          code: 'invalid_code',
          message: 'Invalid or expired delivery code.',
        });
      }

      if (activeCode.expiresAt.getTime() <= Date.now()) {
        await this.recordDeliveryVerificationFailure(
          manager,
          row.id,
          authUser.userId,
          'expired_code',
          false,
          null,
        );
        throw new BadRequestException({
          code: 'invalid_code',
          message: 'Invalid or expired delivery code.',
        });
      }

      const codeMatch = await bcrypt.compare(plainCode, activeCode.codeHash);
      const amountMatch = this.amountsMatch(row.amount, dto.amountReceived);

      if (!codeMatch || !amountMatch) {
        await this.recordDeliveryVerificationFailure(
          manager,
          row.id,
          authUser.userId,
          !codeMatch && !amountMatch
            ? 'invalid_code_and_amount'
            : !codeMatch
              ? 'invalid_code'
              : 'invalid_amount',
          codeMatch,
          amountMatch,
        );
        if (!codeMatch && !amountMatch) {
          throw new BadRequestException({
            code: 'invalid_code_and_amount',
            message: 'Delivery verification failed: code and amount do not match.',
          });
        }
        if (!codeMatch) {
          throw new BadRequestException({
            code: 'invalid_code',
            message: 'The authentication code does not match.',
          });
        }
        throw new BadRequestException({
          code: 'invalid_amount',
          message: 'The amount does not match the transaction.',
        });
      }

      activeCode.verifiedAt = new Date();
      activeCode.codeEncrypted = null;
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
        metadata: { verification: 'code_and_amount' },
      });
      await histRepo.save(hist);

      const allHistory = await histRepo.find({
        where: { transactionId: saved.id },
        order: { createdAt: 'ASC' },
      });
      return this.toDetail(saved, allHistory, { deliveryAuthCode: null });
    });

    await this.workflowHooks.onBrokerBDeliveryConfirmed(savedForHook);
    return detail;
  }

  async coordinatorCancel(
    authUser: AuthenticatedUser,
    id: string,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertFundsAccess(actor);

    await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const histRepo = manager.getRepository(TransactionStatusHistory);
      const row = await txRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.coordinatorId !== authUser.userId) {
        throw new NotFoundException('Transaction not found.');
      }
      if (row.status !== TransactionStatus.PENDING) {
        throw new BadRequestException(
          'Only a pending transfer can be cancelled from here.',
        );
      }
      row.status = TransactionStatus.CANCELLED;
      await txRepo.save(row);

      const hist = histRepo.create({
        transactionId: row.id,
        fromStatus: TransactionStatus.PENDING,
        toStatus: TransactionStatus.CANCELLED,
        changedByUserId: authUser.userId,
        changeReason: 'Cancelled by coordinator.',
        metadata: null,
      });
      await histRepo.save(hist);
    });

    return this.getDetailForCoordinator(authUser, id);
  }

  async coordinatorChangeRecipient(
    authUser: AuthenticatedUser,
    id: string,
    dto: CoordinatorChangeRecipientDto,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertFundsAccess(actor);

    const recipient = await this.recipients.findEligibleForTransactionForUser(
      dto.recipientId,
      { mode: 'user', userId: authUser.userId },
    );
    if (!recipient) {
      throw new BadRequestException(
        'Recipient not found, inactive, not visible to your account, or not eligible for transactions.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const row = await txRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.coordinatorId !== authUser.userId) {
        throw new NotFoundException('Transaction not found.');
      }
      assertMajorWorkflowFieldsUnlocked(row);
      if (row.status !== TransactionStatus.PENDING) {
        throw new BadRequestException(
          'Recipient can only be changed while the transfer is pending.',
        );
      }
      if (row.recipientId === dto.recipientId) {
        throw new BadRequestException('This recipient is already assigned.');
      }
      row.recipientId = dto.recipientId;
      await txRepo.save(row);
    });

    return this.getDetailForCoordinator(authUser, id);
  }

  async coordinatorChangeBrokerA(
    authUser: AuthenticatedUser,
    id: string,
    dto: CoordinatorChangeBrokerADto,
  ): Promise<TransactionDetailView> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertFundsAccess(actor);

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

    await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const row = await txRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row || row.coordinatorId !== authUser.userId) {
        throw new NotFoundException('Transaction not found.');
      }
      assertMajorWorkflowFieldsUnlocked(row);
      if (row.status !== TransactionStatus.PENDING) {
        throw new BadRequestException(
          'Intermediary can only be changed while the transfer is pending.',
        );
      }
      if (row.brokerAUserId === dto.brokerAUserId) {
        throw new BadRequestException('This intermediary is already assigned.');
      }
      row.brokerAUserId = dto.brokerAUserId;
      await txRepo.save(row);
    });

    return this.getDetailForCoordinator(authUser, id);
  }
}
