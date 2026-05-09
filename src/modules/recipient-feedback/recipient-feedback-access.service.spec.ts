import { ForbiddenException, GoneException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { TransactionStatus } from '../../common/enums/transaction-status.enum';
import {
  generateUrlSafeToken,
  hashOpaqueToken,
} from '../auth/crypto/opaque-token.util';
import { Recipient } from '../recipients/entities/recipient.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { RecipientFeedbackAccessToken } from './entities/recipient-feedback-access-token.entity';
import { RecipientFeedback } from './entities/recipient-feedback.entity';
import { RecipientFeedbackAccessService } from './recipient-feedback-access.service';
import { FeedbackAccessErrorCode } from './recipient-feedback.constants';

describe('RecipientFeedbackAccessService', () => {
  const pepper = 'unit-test-feedback-pepper';

  let service: RecipientFeedbackAccessService;
  let accessTokens: jest.Mocked<
    Pick<
      Repository<RecipientFeedbackAccessToken>,
      'findOne' | 'update' | 'save' | 'create'
    >
  >;
  let feedback: jest.Mocked<Pick<Repository<RecipientFeedback>, 'findOne'>>;
  let transactions: jest.Mocked<Pick<Repository<Transaction>, 'findOne'>>;
  let recipients: jest.Mocked<Pick<Repository<Recipient>, 'findOne'>>;
  let dataSource: { transaction: jest.Mock };

  const mockTx = (): Transaction =>
    ({
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      recipientId: '11111111-bbbb-cccc-dddd-eeeeeeeeeeee',
      status: TransactionStatus.DELIVERED,
      amount: '250.00',
      currency: 'USD',
    }) as Transaction;

  beforeEach(async () => {
    accessTokens = {
      findOne: jest.fn(),
      update: jest.fn(),
      save: jest.fn(),
      create: jest.fn((v: object) => v),
    } as unknown as jest.Mocked<
      Pick<
        Repository<RecipientFeedbackAccessToken>,
        'findOne' | 'update' | 'save' | 'create'
      >
    >;
    feedback = { findOne: jest.fn() };
    transactions = { findOne: jest.fn() };
    recipients = {
      findOne: jest.fn().mockResolvedValue({
        firstName: 'Jamie',
      } as Recipient),
    };
    dataSource = {
      transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => {
        const manager = {
          getRepository: (ent: unknown) => {
            if (ent === Transaction) return transactions;
            if (ent === RecipientFeedbackAccessToken) return accessTokens;
            throw new Error(`unexpected entity ${String(ent)}`);
          },
        };
        return fn(manager);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipientFeedbackAccessService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: () => ({
              opaqueTokenPepper: pepper,
              feedbackAccessTokenTtlSeconds: 3600,
            }),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: getRepositoryToken(RecipientFeedbackAccessToken),
          useValue: accessTokens,
        },
        {
          provide: getRepositoryToken(RecipientFeedback),
          useValue: feedback,
        },
        {
          provide: getRepositoryToken(Transaction),
          useValue: transactions,
        },
        {
          provide: getRepositoryToken(Recipient),
          useValue: recipients,
        },
      ],
    }).compile();

    service = module.get(RecipientFeedbackAccessService);
  });

  describe('getAccessByRawToken', () => {
    it('rejects blank token as invalid', async () => {
      await expect(service.getAccessByRawToken('   ')).rejects.toMatchObject({
        response: expect.objectContaining({
          code: FeedbackAccessErrorCode.TOKEN_INVALID,
        }),
      });
      expect(accessTokens.findOne).not.toHaveBeenCalled();
    });

    it('rejects unknown token hash', async () => {
      accessTokens.findOne.mockResolvedValue(null);
      const raw = generateUrlSafeToken(16);
      await expect(service.getAccessByRawToken(raw)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rejects invalidated token', async () => {
      accessTokens.findOne.mockResolvedValue({
        invalidatedAt: new Date(),
        expiresAt: new Date(Date.now() + 60_000),
        recipientId: mockTx().recipientId,
        transaction: mockTx(),
      } as RecipientFeedbackAccessToken);
      await expect(
        service.getAccessByRawToken(generateUrlSafeToken(8)),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: FeedbackAccessErrorCode.TOKEN_INVALID,
        }),
      });
    });

    it('rejects expired token', async () => {
      const raw = generateUrlSafeToken(24);
      accessTokens.findOne.mockResolvedValue({
        tokenHash: hashOpaqueToken(raw, pepper),
        invalidatedAt: null,
        expiresAt: new Date(Date.now() - 1000),
        recipientId: mockTx().recipientId,
        transaction: mockTx(),
      } as RecipientFeedbackAccessToken);

      await expect(service.getAccessByRawToken(raw)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: FeedbackAccessErrorCode.TOKEN_EXPIRED,
        }),
      });
      await expect(service.getAccessByRawToken(raw)).rejects.toBeInstanceOf(
        GoneException,
      );
    });

    it('rejects when transaction is not feedback-eligible', async () => {
      const raw = generateUrlSafeToken(24);
      const tx = mockTx();
      tx.status = TransactionStatus.BROKER_B_ACCEPTED;
      accessTokens.findOne.mockResolvedValue({
        tokenHash: hashOpaqueToken(raw, pepper),
        invalidatedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        recipientId: tx.recipientId,
        transaction: tx,
      } as RecipientFeedbackAccessToken);

      await expect(service.getAccessByRawToken(raw)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: FeedbackAccessErrorCode.TRANSACTION_NOT_ELIGIBLE,
        }),
      });
      await expect(service.getAccessByRawToken(raw)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('allows read-only access when status is feedback_submitted', async () => {
      const raw = generateUrlSafeToken(24);
      const tx = mockTx();
      tx.status = TransactionStatus.FEEDBACK_SUBMITTED;
      accessTokens.findOne.mockResolvedValue({
        tokenHash: hashOpaqueToken(raw, pepper),
        invalidatedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        recipientId: tx.recipientId,
        transaction: tx,
      } as RecipientFeedbackAccessToken);
      feedback.findOne.mockResolvedValue({ id: 'fb-1' } as RecipientFeedback);

      const out = await service.getAccessByRawToken(raw);
      expect(out.status).toBe('valid');
      expect(out.canSubmit).toBe(false);
    });

    it('rejects when token recipient does not match transaction recipient', async () => {
      const raw = generateUrlSafeToken(24);
      const tx = mockTx();
      accessTokens.findOne.mockResolvedValue({
        tokenHash: hashOpaqueToken(raw, pepper),
        invalidatedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        recipientId: '99999999-bbbb-cccc-dddd-eeeeeeeeeeee',
        transaction: tx,
      } as RecipientFeedbackAccessToken);

      await expect(service.getAccessByRawToken(raw)).rejects.toMatchObject({
        response: expect.objectContaining({
          code: FeedbackAccessErrorCode.TOKEN_INVALID,
        }),
      });
    });

    it('returns valid access when delivered and no feedback yet', async () => {
      const raw = generateUrlSafeToken(24);
      const tx = mockTx();
      accessTokens.findOne.mockResolvedValue({
        tokenHash: hashOpaqueToken(raw, pepper),
        invalidatedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        recipientId: tx.recipientId,
        transaction: tx,
      } as RecipientFeedbackAccessToken);
      feedback.findOne.mockResolvedValue(null);

      const out = await service.getAccessByRawToken(raw);
      expect(out).toEqual({
        status: 'valid',
        canSubmit: true,
        transaction: {
          id: tx.id,
          amount: tx.amount,
          currency: tx.currency,
        },
        recipientFirstName: 'Jamie',
      });
    });

    it('returns valid with canSubmit false when feedback already exists', async () => {
      const raw = generateUrlSafeToken(24);
      const tx = mockTx();
      accessTokens.findOne.mockResolvedValue({
        tokenHash: hashOpaqueToken(raw, pepper),
        invalidatedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        recipientId: tx.recipientId,
        transaction: tx,
      } as RecipientFeedbackAccessToken);
      feedback.findOne.mockResolvedValue({ id: 'fb-1' } as RecipientFeedback);

      const out = await service.getAccessByRawToken(raw);
      expect(out.status).toBe('valid');
      expect(out.canSubmit).toBe(false);
    });
  });

  describe('issueAccessTokenForDeliveredTransaction', () => {
    it('refuses when transaction is not delivered', async () => {
      transactions.findOne.mockResolvedValue({
        ...mockTx(),
        status: TransactionStatus.PENDING,
      } as Transaction);

      await expect(
        service.issueAccessTokenForDeliveredTransaction(mockTx().id),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          code: FeedbackAccessErrorCode.TRANSACTION_NOT_ELIGIBLE,
        }),
      });
    });

    it('invalidates prior tokens, persists hash, returns raw token', async () => {
      const tx = mockTx();
      transactions.findOne.mockResolvedValue(tx);
      accessTokens.update.mockResolvedValue({ affected: 1 } as never);
      accessTokens.save.mockResolvedValue({} as RecipientFeedbackAccessToken);

      const out = await service.issueAccessTokenForDeliveredTransaction(tx.id);

      expect(out.rawToken).toEqual(expect.any(String));
      expect(out.rawToken.length).toBeGreaterThan(20);
      expect(accessTokens.update).toHaveBeenCalledWith(
        { transactionId: tx.id, invalidatedAt: IsNull() },
        expect.objectContaining({ invalidatedAt: expect.any(Date) }),
      );
      expect(accessTokens.save).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: tx.id,
          recipientId: tx.recipientId,
          tokenHash: hashOpaqueToken(out.rawToken, pepper),
          invalidatedAt: null,
        }),
      );
    });
  });
});
