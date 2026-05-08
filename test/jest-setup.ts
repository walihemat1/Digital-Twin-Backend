/**
 * Shared Jest setup for unit tests (`npm test`).
 * E2E uses `test/jest-e2e.json` and does not load this file.
 */
jest.setTimeout(15_000);

if (!process.env.RECIPIENT_IDENTITY_ENCRYPTION_KEY) {
  process.env.RECIPIENT_IDENTITY_ENCRYPTION_KEY = 'test-recipient-identity-pepper';
}
