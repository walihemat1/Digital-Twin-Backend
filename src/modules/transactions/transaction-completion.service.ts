import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { RecipientFeedback } from '../recipient-feedback/entities/recipient-feedback.entity';
import { User } from '../users/entities/user.entity';
import { AffirmRecipientFeedbackDto } from './dto/affirm-recipient-feedback.dto';
import { CoordinatorAffirmation } from './entities/coordinator-affirmation.entity';
import { TransactionStatusHistory } from './entities/transaction-status-history.entity';
import { Transaction } from './entities/transaction.entity';
import {
  assertCoordinatorAffirmationNotYetRecorded,
  assertRecipientFeedbackPresentForCompletion,
  assertTransactionEligibleForCoordinatorCompletion,
} from './transaction-completion.rules';

@Injectable()
export class TransactionCompletionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  async affirmFeedbackAndComplete(
    authUser: AuthenticatedUser,
    transactionId: string,
    dto: AffirmRecipientFeedbackDto,
  ): Promise<void> {
    const actor = await this.dataSource.manager.findOne(User, {
      where: { id: authUser.userId },
    });
    if (!actor) {
      throw new ForbiddenException('User not found.');
    }
    if (actor.role !== UserRole.COORDINATOR_SENDER) {
      throw new ForbiddenException('Only a coordinator/sender may affirm feedback.');
    }
    if (actor.accountStatus !== AccountStatus.ACTIVE) {
      throw new ForbiddenException('Account is not approved for this action.');
    }

    const commentRaw = dto.coordinatorComment?.trim() ?? '';
    const coordinatorComment =
      commentRaw.length > 0 ? commentRaw : null;
    const affirmedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const row = await txRepo.findOne({
        where: { id: transactionId, coordinatorId: authUser.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!row) {
        throw new NotFoundException('Transaction not found.');
      }

      assertTransactionEligibleForCoordinatorCompletion(row);

      const feedbackRepo = manager.getRepository(RecipientFeedback);
      const feedback = await feedbackRepo.findOne({
        where: { transactionId: row.id },
      });
      assertRecipientFeedbackPresentForCompletion(feedback);

      const affirmationRepo = manager.getRepository(CoordinatorAffirmation);
      const existingAffirmation = await affirmationRepo.findOne({
        where: { transactionId: row.id },
      });
      assertCoordinatorAffirmationNotYetRecorded(existingAffirmation);

      await affirmationRepo.save(
        affirmationRepo.create({
          transactionId: row.id,
          coordinatorId: authUser.userId,
          coordinatorComment,
          affirmedAt,
        }),
      );

      const prevStatus = row.status;
      row.status = TransactionStatus.COMPLETED;
      row.completedAt = affirmedAt;
      await txRepo.save(row);

      const histRepo = manager.getRepository(TransactionStatusHistory);
      await histRepo.save(
        histRepo.create({
          transactionId: row.id,
          fromStatus: prevStatus,
          toStatus: TransactionStatus.COMPLETED,
          changedByUserId: authUser.userId,
          changeReason: null,
          metadata: null,
        }),
      );

      await this.audit.appendWithManager(manager, {
        actorUserId: authUser.userId,
        actorType: 'user',
        entityType: 'transaction',
        entityId: row.id,
        actionType: 'transaction.coordinator_affirmed_completed',
        oldValues: { status: prevStatus, completedAt: null },
        newValues: {
          status: TransactionStatus.COMPLETED,
          completedAt: affirmedAt.toISOString(),
          coordinatorComment,
        },
        metadata: null,
      });
    });
  }
}
