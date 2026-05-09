import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransactionStatusHistory } from '../transactions/entities/transaction-status-history.entity';
import { SubmitRecipientFeedbackDto } from './dto/submit-recipient-feedback.dto';
import { RecipientFeedback } from './entities/recipient-feedback.entity';
import { RecipientFeedbackAccessService } from './recipient-feedback-access.service';
import { FeedbackAccessErrorCode } from './recipient-feedback.constants';

export type RecipientFeedbackSubmissionView = {
  transactionId: string;
  status: TransactionStatus.FEEDBACK_SUBMITTED;
  submittedAt: string;
  actualAmountReceived: string;
};

@Injectable()
export class RecipientFeedbackSubmissionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly feedbackAccess: RecipientFeedbackAccessService,
  ) {}

  async submitFeedback(
    rawToken: string,
    dto: SubmitRecipientFeedbackDto,
  ): Promise<RecipientFeedbackSubmissionView> {
    const trimmed = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!trimmed) {
      throw new NotFoundException({
        code: FeedbackAccessErrorCode.TOKEN_INVALID,
        errorMessage: 'Invalid feedback link.',
      });
    }

    const resolved = await this.feedbackAccess.resolveActiveFeedbackToken(
      trimmed,
    );
    const txId = resolved.transaction.id;
    const recipientId = resolved.recipientId;

    if (resolved.transaction.status !== TransactionStatus.DELIVERED) {
      if (
        resolved.transaction.status === TransactionStatus.FEEDBACK_SUBMITTED
      ) {
        throw new ConflictException({
          code: FeedbackAccessErrorCode.FEEDBACK_ALREADY_SUBMITTED,
          errorMessage: 'Feedback has already been submitted.',
        });
      }
      throw new ForbiddenException({
        code: FeedbackAccessErrorCode.TRANSACTION_NOT_ELIGIBLE,
        errorMessage:
          'Feedback can only be submitted after delivery for this transaction.',
      });
    }

    const submittedAt = new Date();
    const amountStr = dto.actualAmountReceived.toFixed(2);
    const commentRaw = dto.feedbackComment?.trim() ?? '';
    const feedbackComment = commentRaw.length > 0 ? commentRaw : null;

    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const row = await txRepo.findOne({
        where: { id: txId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!row || row.recipientId !== recipientId) {
        throw new NotFoundException({
          code: FeedbackAccessErrorCode.TOKEN_INVALID,
          errorMessage: 'Invalid feedback link.',
        });
      }

      if (row.status !== TransactionStatus.DELIVERED) {
        if (row.status === TransactionStatus.FEEDBACK_SUBMITTED) {
          throw new ConflictException({
            code: FeedbackAccessErrorCode.FEEDBACK_ALREADY_SUBMITTED,
            errorMessage: 'Feedback has already been submitted.',
          });
        }
        throw new ForbiddenException({
          code: FeedbackAccessErrorCode.TRANSACTION_NOT_ELIGIBLE,
          errorMessage:
            'Feedback can only be submitted after delivery for this transaction.',
        });
      }

      const feedbackRepo = manager.getRepository(RecipientFeedback);
      const existing = await feedbackRepo.findOne({
        where: { transactionId: row.id },
      });
      if (existing) {
        throw new ConflictException({
          code: FeedbackAccessErrorCode.FEEDBACK_ALREADY_SUBMITTED,
          errorMessage: 'Feedback has already been submitted.',
        });
      }

      await feedbackRepo.save(
        feedbackRepo.create({
          transactionId: row.id,
          recipientId,
          feedbackComment,
          actualAmountReceived: amountStr,
          submittedAt,
          sourceChannel: null,
        }),
      );

      row.status = TransactionStatus.FEEDBACK_SUBMITTED;
      await txRepo.save(row);

      const histRepo = manager.getRepository(TransactionStatusHistory);
      await histRepo.save(
        histRepo.create({
          transactionId: row.id,
          fromStatus: TransactionStatus.DELIVERED,
          toStatus: TransactionStatus.FEEDBACK_SUBMITTED,
          changedByUserId: null,
          changeReason: null,
          metadata: null,
        }),
      );

      return {
        transactionId: row.id,
        status: TransactionStatus.FEEDBACK_SUBMITTED,
        submittedAt: submittedAt.toISOString(),
        actualAmountReceived: amountStr,
      };
    });
  }
}
