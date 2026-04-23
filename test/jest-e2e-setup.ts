/**
 * E2E runs with `NODE_ENV=test` so TypeORM uses shorter DB retry settings
 * (see `src/database/typeorm-options.factory.ts`). Ensure Postgres matches `.env.example`
 * or your local `DB_*` variables before `npm run test:e2e`.
 */
process.env.NODE_ENV = 'test';
