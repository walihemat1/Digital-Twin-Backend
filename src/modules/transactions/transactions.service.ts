import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { User } from '../users/entities/user.entity';
import { RecipientsRepository } from '../recipients/recipients.repository';
import { SubmitTransactionDto } from './dto/submit-transaction.dto';
import { TransactionStatusHistory } from './entities/transaction-status-history.entity';
import { Transaction } from './entities/transaction.entity';

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

export type TransactionDetailView = TransactionSummaryView & {
  transfer_method: string;
  verification_method: string;
  description: string | null;
  current_stage: string | null;
  delivery_confirmed_at: Date | null;
  completed_at: Date | null;
  status_history: TransactionStatusHistoryView[];
};

@Injectable()
export class TransactionsService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(TransactionStatusHistory)
    private readonly statusHistory: Repository<TransactionStatusHistory>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly recipients: RecipientsRepository,
  ) {}

  private assertFundsAccess(actor: User): void {
    if (actor.role !== UserRole.COORDINATOR_SENDER) {
      throw new ForbiddenException('Only a coordinator/sender may manage funds.');
    }
    if (actor.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Account is not approved for this action.');
    }
  }

  /** Explicit Broker A read gate: role + active account (mirrors coordinator funds checks). */
  private assertBrokerAReadAccess(actor: User): void {
    if (actor.role !== UserRole.BROKER_A) {
      throw new ForbiddenException('Only Broker A may view assigned transactions.');
    }
    if (actor.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Account is not approved for this action.');
    }
  }

  private toHistoryView(row: TransactionStatusHistory): TransactionStatusHistoryView {
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
  ): TransactionDetailView {
    return {
      ...this.toSummary(tx),
      transfer_method: tx.transferMethod,
      verification_method: tx.verificationMethod,
      description: tx.description,
      current_stage: tx.currentStage,
      delivery_confirmed_at: tx.deliveryConfirmedAt,
      completed_at: tx.completedAt,
      status_history: history.map((h) => this.toHistoryView(h)),
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
      throw new BadRequestException('Selected user is not an eligible Broker A.');
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
    options?: { offset?: number; limit?: number },
  ): Promise<TransactionSummaryView[]> {
    const actor = await this.users.findOne({ where: { id: authUser.userId } });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    this.assertFundsAccess(actor);

    const take = Math.min(Math.max(options?.limit ?? 20, 1), 50);
    const skip = Math.max(options?.offset ?? 0, 0);

    const rows = await this.transactions.find({
      where: { coordinatorId: authUser.userId },
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

    return this.toDetail(tx, history);
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
}
