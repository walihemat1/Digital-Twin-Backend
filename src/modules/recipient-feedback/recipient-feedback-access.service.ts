import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import type { AuthConfigValues } from '../../config/auth.config';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import {
  generateUrlSafeToken,
  hashOpaqueToken,
} from '../auth/crypto/opaque-token.util';
import { Recipient } from '../recipients/entities/recipient.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { RecipientFeedbackAccessToken } from './entities/recipient-feedback-access-token.entity';
import { RecipientFeedback } from './entities/recipient-feedback.entity';
import { FeedbackAccessErrorCode } from './recipient-feedback.constants';

/** Statuses where a recipient may open the tokenized feedback page (read-only after submit). */
const FEEDBACK_ACCESS_TRANSACTION_STATUSES: ReadonlySet<TransactionStatus> =
  new Set([TransactionStatus.DELIVERED, TransactionStatus.FEEDBACK_SUBMITTED]);

export type RecipientFeedbackAccessSuccess = {
  status: 'valid';
  canSubmit: boolean;
  transaction: {
    id: string;
    amount: string;
    currency: string;
  };
  recipientFirstName: string;
};

@Injectable()
export class RecipientFeedbackAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    @InjectRepository(RecipientFeedbackAccessToken)
    private readonly accessTokens: Repository<RecipientFeedbackAccessToken>,
    @InjectRepository(RecipientFeedback)
    private readonly feedback: Repository<RecipientFeedback>,
    @InjectRepository(Transaction)
    private readonly transactions: Repository<Transaction>,
    @InjectRepository(Recipient)
    private readonly recipients: Repository<Recipient>,
  ) {}

  /**
   * Resolves an active (non-expired, non-invalidated) feedback URL token to its transaction.
   * Does not enforce transaction workflow status; callers apply delivery / submission rules.
   */
  async resolveActiveFeedbackToken(
    trimmedRawToken: string,
  ): Promise<{ transaction: Transaction; recipientId: string }> {
    const auth = this.config.getOrThrow<AuthConfigValues>('auth');
    const tokenHash = hashOpaqueToken(trimmedRawToken, auth.opaqueTokenPepper);

    const record = await this.accessTokens.findOne({
      where: { tokenHash },
      relations: { transaction: true },
    });

    if (!record || record.invalidatedAt) {
      throw new NotFoundException({
        code: FeedbackAccessErrorCode.TOKEN_INVALID,
        errorMessage: 'Invalid feedback link.',
      });
    }

    const now = new Date();
    if (now > record.expiresAt) {
      throw new GoneException({
        code: FeedbackAccessErrorCode.TOKEN_EXPIRED,
        errorMessage: 'This feedback link has expired.',
      });
    }

    const tx = record.transaction;
    if (!tx) {
      throw new NotFoundException({
        code: FeedbackAccessErrorCode.TOKEN_INVALID,
        errorMessage: 'Invalid feedback link.',
      });
    }

    if (tx.recipientId !== record.recipientId) {
      throw new NotFoundException({
        code: FeedbackAccessErrorCode.TOKEN_INVALID,
        errorMessage: 'Invalid feedback link.',
      });
    }

    return { transaction: tx, recipientId: record.recipientId };
  }

  /**
   * Validates a raw URL token and returns submission eligibility for the feedback form.
   * Tokens are stored as HMAC-SHA256 fingerprints (opaque-token pepper).
   */
  async getAccessByRawToken(
    rawToken: string,
  ): Promise<RecipientFeedbackAccessSuccess> {
    const trimmed = typeof rawToken === 'string' ? rawToken.trim() : '';
    if (!trimmed) {
      throw new NotFoundException({
        code: FeedbackAccessErrorCode.TOKEN_INVALID,
        errorMessage: 'Invalid feedback link.',
      });
    }

    const { transaction: tx, recipientId } =
      await this.resolveActiveFeedbackToken(trimmed);

    if (!FEEDBACK_ACCESS_TRANSACTION_STATUSES.has(tx.status)) {
      throw new ForbiddenException({
        code: FeedbackAccessErrorCode.TRANSACTION_NOT_ELIGIBLE,
        errorMessage:
          'Feedback is only available after delivery for this transaction.',
      });
    }

    const existing = await this.feedback.findOne({
      where: { transactionId: tx.id },
    });

    const recipient = await this.recipients.findOne({
      where: { id: recipientId },
    });

    return {
      status: 'valid',
      canSubmit: !existing,
      transaction: {
        id: tx.id,
        amount: tx.amount,
        currency: tx.currency,
      },
      recipientFirstName: recipient?.firstName ?? '',
    };
  }

  /**
   * Issues a new feedback access token for a delivered transaction.
   * Supersedes any prior active tokens for the same transaction (latest wins).
   */
  async issueAccessTokenForDeliveredTransaction(
    transactionId: string,
  ): Promise<{ rawToken: string }> {
    const auth = this.config.getOrThrow<AuthConfigValues>('auth');
    const ttlSeconds = auth.feedbackAccessTokenTtlSeconds;

    return this.dataSource.transaction(async (manager) => {
      const txRepo = manager.getRepository(Transaction);
      const tokenRepo = manager.getRepository(RecipientFeedbackAccessToken);

      const tx = await txRepo.findOne({ where: { id: transactionId } });
      if (!tx || tx.status !== TransactionStatus.DELIVERED) {
        throw new ForbiddenException({
          code: FeedbackAccessErrorCode.TRANSACTION_NOT_ELIGIBLE,
          errorMessage:
            'Feedback tokens can only be issued for delivered transactions.',
        });
      }

      const now = new Date();
      await tokenRepo.update(
        {
          transactionId,
          invalidatedAt: IsNull(),
        },
        { invalidatedAt: now },
      );

      const rawToken = generateUrlSafeToken(32);
      const tokenHash = hashOpaqueToken(rawToken, auth.opaqueTokenPepper);
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

      await tokenRepo.save(
        tokenRepo.create({
          transactionId: tx.id,
          recipientId: tx.recipientId,
          tokenHash,
          issuedAt: now,
          expiresAt,
          invalidatedAt: null,
        }),
      );

      return { rawToken };
    });
  }
}
