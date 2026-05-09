import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import { Transaction } from '../transactions/entities/transaction.entity';
import { TransactionStatusHistory } from '../transactions/entities/transaction-status-history.entity';
import { SubmitRecipientFeedbackDto } from './dto/submit-recipient-feedback.dto';
import { RecipientFeedback } from './entities/recipient-feedback.entity';
import { RecipientFeedbackAccessService } from './recipient-feedback-access.service';
import { RecipientFeedbackSubmissionService } from './recipient-feedback-submission.service';
import { FeedbackAccessErrorCode } from './recipient-feedback.constants';

describe('RecipientFeedbackSubmissionService', () => {
  let service: RecipientFeedbackSubmissionService;
  let feedbackAccess: jest.Mocked<
    Pick<RecipientFeedbackAccessService, 'resolveActiveFeedbackToken'>
  >;
  let dataSource: { transaction: jest.Mock };

  const deliveredTx = (): Transaction =>
    ({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      recipientId: '11111111-bbbb-cccc-dddd-eeeeeeeeeeee',
      status: TransactionStatus.DELIVERED,
    }) as Transaction;

  beforeEach(async () => {
    feedbackAccess = {
      resolveActiveFeedbackToken: jest.fn(),
    };

    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipientFeedbackSubmissionService,
        { provide: DataSource, useValue: dataSource },
        { provide: RecipientFeedbackAccessService, useValue: feedbackAccess },
      ],
    }).compile();

    service = module.get(RecipientFeedbackSubmissionService);
  });

  describe('submitFeedback', () => {
    it('rejects blank token without resolving', async () => {
      await expect(
        service.submitFeedback('   ', {
          actualAmountReceived: 10,
        } as SubmitRecipientFeedbackDto),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: FeedbackAccessErrorCode.TOKEN_INVALID,
        }),
      });
      expect(feedbackAccess.resolveActiveFeedbackToken).not.toHaveBeenCalled();
    });

    it('rejects when transaction is not delivered', async () => {
      const tx = deliveredTx();
      tx.status = TransactionStatus.BROKER_B_ACCEPTED;
      feedbackAccess.resolveActiveFeedbackToken.mockResolvedValue({
        transaction: tx,
        recipientId: tx.recipientId,
      });

      await expect(
        service.submitFeedback('tok', {
          actualAmountReceived: 10,
        } as SubmitRecipientFeedbackDto),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: FeedbackAccessErrorCode.TRANSACTION_NOT_ELIGIBLE,
        }),
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects duplicate when status is already feedback_submitted', async () => {
      const tx = deliveredTx();
      tx.status = TransactionStatus.FEEDBACK_SUBMITTED;
      feedbackAccess.resolveActiveFeedbackToken.mockResolvedValue({
        transaction: tx,
        recipientId: tx.recipientId,
      });

      await expect(
        service.submitFeedback('tok', {
          actualAmountReceived: 10,
        } as SubmitRecipientFeedbackDto),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: FeedbackAccessErrorCode.FEEDBACK_ALREADY_SUBMITTED,
        }),
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('persists feedback, updates transaction status, and writes history', async () => {
      const tx = deliveredTx();
      feedbackAccess.resolveActiveFeedbackToken.mockResolvedValue({
        transaction: tx,
        recipientId: tx.recipientId,
      });

      const txRepo = {
        findOne: jest.fn().mockResolvedValue({
          ...tx,
          status: TransactionStatus.DELIVERED,
        }),
        save: jest.fn().mockImplementation((r) => Promise.resolve(r)),
      };
      const feedbackRepo = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((v) => v),
        save: jest.fn().mockResolvedValue({}),
      };
      const histRepo = {
        create: jest.fn((v) => v),
        save: jest.fn().mockResolvedValue({}),
      };

      dataSource.transaction.mockImplementation(
        async (fn: (m: unknown) => Promise<unknown>) => {
          const manager = {
            getRepository: (ent: unknown) => {
              if (ent === Transaction) return txRepo;
              if (ent === RecipientFeedback) return feedbackRepo;
              if (ent === TransactionStatusHistory) return histRepo;
              throw new Error(`unexpected entity ${String(ent)}`);
            },
          };
          return fn(manager);
        },
      );

      const out = await service.submitFeedback('raw-token', {
        actualAmountReceived: 199.9,
        feedbackComment: ' All good ',
      });

      expect(out.transactionId).toBe(tx.id);
      expect(out.status).toBe(TransactionStatus.FEEDBACK_SUBMITTED);
      expect(out.actualAmountReceived).toBe('199.90');
      expect(feedbackRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: tx.id,
          recipientId: tx.recipientId,
          feedbackComment: 'All good',
          actualAmountReceived: '199.90',
          sourceChannel: null,
        }),
      );
      expect(txRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: tx.id,
          status: TransactionStatus.FEEDBACK_SUBMITTED,
        }),
      );
      expect(histRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: tx.id,
          fromStatus: TransactionStatus.DELIVERED,
          toStatus: TransactionStatus.FEEDBACK_SUBMITTED,
          changedByUserId: null,
        }),
      );
    });

    it('conflicts when feedback row exists inside the transaction', async () => {
      const tx = deliveredTx();
      feedbackAccess.resolveActiveFeedbackToken.mockResolvedValue({
        transaction: tx,
        recipientId: tx.recipientId,
      });

      const txRepo = {
        findOne: jest.fn().mockResolvedValue({
          ...tx,
          status: TransactionStatus.DELIVERED,
        }),
        save: jest.fn(),
      };
      const feedbackRepo = {
        findOne: jest.fn().mockResolvedValue({ id: 'fb-1' }),
        create: jest.fn(),
        save: jest.fn(),
      };

      dataSource.transaction.mockImplementation(
        async (fn: (m: unknown) => Promise<unknown>) => {
          const manager = {
            getRepository: (ent: unknown) => {
              if (ent === Transaction) return txRepo;
              if (ent === RecipientFeedback) return feedbackRepo;
              throw new Error(`unexpected entity ${String(ent)}`);
            },
          };
          return fn(manager);
        },
      );

      await expect(
        service.submitFeedback('tok', {
          actualAmountReceived: 10,
        } as SubmitRecipientFeedbackDto),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(feedbackRepo.save).not.toHaveBeenCalled();
    });

    it('returns not found when locked transaction mismatches token recipient', async () => {
      const tx = deliveredTx();
      feedbackAccess.resolveActiveFeedbackToken.mockResolvedValue({
        transaction: tx,
        recipientId: tx.recipientId,
      });

      const txRepo = {
        findOne: jest.fn().mockResolvedValue({
          ...tx,
          recipientId: '99999999-bbbb-cccc-dddd-eeeeeeeeeeee',
          status: TransactionStatus.DELIVERED,
        }),
        save: jest.fn(),
      };

      dataSource.transaction.mockImplementation(
        async (fn: (m: unknown) => Promise<unknown>) => {
          const manager = {
            getRepository: (ent: unknown) => {
              if (ent === Transaction) return txRepo;
              throw new Error(`unexpected entity ${String(ent)}`);
            },
          };
          return fn(manager);
        },
      );

      await expect(
        service.submitFeedback('tok', {
          actualAmountReceived: 10,
        } as SubmitRecipientFeedbackDto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('SubmitRecipientFeedbackDto validation', () => {
    it('fails when actualAmountReceived is missing', async () => {
      const dto = plainToInstance(SubmitRecipientFeedbackDto, {});
      const errors = await validate(dto);
      expect(errors.some((e) => e.property === 'actualAmountReceived')).toBe(
        true,
      );
    });

    it('fails when actualAmountReceived is below minimum', async () => {
      const dto = plainToInstance(SubmitRecipientFeedbackDto, {
        actualAmountReceived: 0,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('fails when actualAmountReceived has more than two decimal places', async () => {
      const dto = plainToInstance(SubmitRecipientFeedbackDto, {
        actualAmountReceived: 10.001,
      });
      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('accepts valid amount and optional comment', async () => {
      const dto = plainToInstance(SubmitRecipientFeedbackDto, {
        actualAmountReceived: 100.5,
        feedbackComment: 'Received',
      });
      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
    });
  });
});
