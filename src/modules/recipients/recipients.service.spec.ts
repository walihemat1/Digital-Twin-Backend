import { BadRequestException } from '@nestjs/common';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { Recipient } from './entities/recipient.entity';
import { RecipientIdentityCryptoService } from './recipient-identity-crypto.service';
import { RecipientsRepository } from './recipients.repository';
import { RecipientsService } from './recipients.service';

describe('RecipientsService', () => {
  let service: RecipientsService;
  let repo: jest.Mocked<Pick<RecipientsRepository, 'save' | 'searchActiveByQuery'>>;
  let crypto: jest.Mocked<Pick<RecipientIdentityCryptoService, 'encrypt'>>;

  beforeEach(() => {
    repo = {
      save: jest.fn(),
      searchActiveByQuery: jest.fn(),
    };
    crypto = { encrypt: jest.fn() };
    service = new RecipientsService(
      repo as RecipientsRepository,
      crypto as unknown as RecipientIdentityCryptoService,
    );
  });

  it('create rejects mismatched identity pair', async () => {
    await expect(
      service.create({
        firstName: 'A',
        lastName: 'B',
        phoneCountryCode: '+1',
        phoneNumber: '5551234567',
        issuingCountry: 'US',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create({
        firstName: 'A',
        lastName: 'B',
        phoneCountryCode: '+1',
        phoneNumber: '5551234567',
        identificationNumber: 'X123',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create encrypts identification and normalizes phone', async () => {
    crypto.encrypt.mockReturnValue('v1:enc');
    repo.save.mockImplementation(async (e) => {
      Object.assign(e, {
        id: 'r1',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      });
      return e as Recipient;
    });

    const out = await service.create({
      firstName: 'Ann',
      lastName: 'Lee',
      phoneCountryCode: '+1',
      phoneNumber: '5551234567',
      issuingCountry: 'US',
      identificationNumber: 'ID-9',
    });

    expect(crypto.encrypt).toHaveBeenCalledWith('ID-9');
    expect(repo.save).toHaveBeenCalled();
    const arg = repo.save.mock.calls[0][0] as Recipient;
    expect(arg.normalizedPhone).toBe('+15551234567');
    expect(arg.identificationNumberEncrypted).toBe('v1:enc');
    expect(out.id).toBe('r1');
    expect(out).not.toHaveProperty('identification_number_encrypted');
  });

  it('search maps repository rows to public views', async () => {
    const row = Object.assign(new Recipient(), {
      id: 'r2',
      firstName: 'Bo',
      lastName: 'C',
      phoneNumber: '+447700900123',
      normalizedPhone: '+447700900123',
      issuingCountry: null,
      identificationNumberEncrypted: null,
      verificationStatus: VerificationStatus.UNVERIFIED,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    repo.searchActiveByQuery.mockResolvedValue([row]);

    const out = await service.search('bo', 10);

    expect(repo.searchActiveByQuery).toHaveBeenCalledWith('bo', 10);
    expect(out).toHaveLength(1);
    expect(out[0].first_name).toBe('Bo');
    expect(out[0].normalized_phone).toBe('+447700900123');
  });
});
