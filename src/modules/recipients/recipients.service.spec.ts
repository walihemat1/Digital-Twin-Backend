import { BadRequestException, ConflictException } from '@nestjs/common';
import { VerificationStatus } from '../../common/enums/verification-status.enum';
import { Recipient } from './entities/recipient.entity';
import { RecipientIdentityCryptoService } from './recipient-identity-crypto.service';
import { RecipientsRepository } from './recipients.repository';
import { RecipientsService } from './recipients.service';

describe('RecipientsService', () => {
  let service: RecipientsService;
  let repo: jest.Mocked<
    Pick<
      RecipientsRepository,
      | 'save'
      | 'searchActiveByQueryPaged'
      | 'findActiveByNormalizedPhone'
    >
  >;
  let crypto: jest.Mocked<
    Pick<RecipientIdentityCryptoService, 'encrypt' | 'decrypt'>
  >;

  const baseCreateDto = {
    firstName: 'Ann',
    lastName: 'Lee',
    phoneCountryCode: '+1',
    phoneNumber: '5551234567',
    countryCode: 'US',
    addressLine1: '1 Main St',
    cityTown: 'Phoenix',
    zipCode: '85001',
  };

  beforeEach(() => {
    repo = {
      save: jest.fn(),
      searchActiveByQueryPaged: jest.fn(),
      findActiveByNormalizedPhone: jest.fn().mockResolvedValue(null),
    };
    crypto = { encrypt: jest.fn(), decrypt: jest.fn() };
    service = new RecipientsService(
      repo as RecipientsRepository,
      crypto as unknown as RecipientIdentityCryptoService,
    );
  });

  it('create rejects mismatched identity pair', async () => {
    await expect(
      service.create({
        ...baseCreateDto,
        issuingCountry: 'US',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create({
        ...baseCreateDto,
        identificationNumber: 'X123',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create rejects mismatched WhatsApp pair', async () => {
    await expect(
      service.create({
        ...baseCreateDto,
        whatsappCountryCode: '+1',
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('create rejects duplicate phone', async () => {
    repo.findActiveByNormalizedPhone.mockResolvedValue({ id: 'x' } as Recipient);
    await expect(service.create(baseCreateDto as any)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('create encrypts identification and normalizes phone', async () => {
    crypto.encrypt.mockReturnValue('v1:enc');
    crypto.decrypt.mockReturnValue('ID-9');
    repo.save.mockImplementation(async (e) => {
      Object.assign(e, {
        id: 'r1',
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      });
      return e as Recipient;
    });

    const out = await service.create({
      ...baseCreateDto,
      stateProvinceCode: 'AZ',
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
    expect(out.identification_number).toBe('ID-9');
  });

  it('searchPaged maps repository rows to public views', async () => {
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
      organizationName: null,
      email: null,
      whatsappNumber: null,
      countryCode: null,
      stateProvinceCode: null,
      addressLine1: null,
      addressLine2: null,
      cityTown: null,
      zipCode: null,
    });
    repo.searchActiveByQueryPaged.mockResolvedValue({ items: [row], total: 1 });

    const out = await service.searchPaged('bo', { limit: 10, page: 1 });

    expect(repo.searchActiveByQueryPaged).toHaveBeenCalledWith('bo', 10, 1);
    expect(out.items).toHaveLength(1);

    repo.searchActiveByQueryPaged.mockResolvedValue({ items: [], total: 0 });
    const emptyOut = await service.searchPaged('', { limit: 10, page: 1 });
    expect(repo.searchActiveByQueryPaged).toHaveBeenCalledWith('', 10, 1);
    expect(emptyOut.items).toHaveLength(0);
    expect(emptyOut.total).toBe(0);
    expect(out.total).toBe(1);
    expect(out.page).toBe(1);
    expect(out.limit).toBe(10);
    expect(out.totalPages).toBe(1);
    expect(out.items[0].first_name).toBe('Bo');
    expect(out.items[0].normalized_phone).toBe('+447700900123');
  });
});
