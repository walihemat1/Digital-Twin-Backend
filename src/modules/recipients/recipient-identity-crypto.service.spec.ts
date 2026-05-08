import { ConfigService } from '@nestjs/config';
import { RecipientIdentityCryptoService } from './recipient-identity-crypto.service';

describe('RecipientIdentityCryptoService', () => {
  it('round-trips plaintext', () => {
    const config = {
      get: jest.fn().mockReturnValue('unit-test-pepper-32-chars-min'),
    } as unknown as ConfigService;
    const svc = new RecipientIdentityCryptoService(config);
    const plain = 'PASSPORT-ABC-123';
    const enc = svc.encrypt(plain);
    expect(enc).toMatch(/^v1:/);
    expect(svc.decrypt(enc)).toBe(plain);
  });
});
