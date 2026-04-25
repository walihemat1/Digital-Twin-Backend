import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnsureUsersEmailLowerIndex1745247000000
  implements MigrationInterface
{
  name = 'EnsureUsersEmailLowerIndex1745247000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [{ exists: usersTableExists }] = (await queryRunner.query(`
      SELECT to_regclass('public.users') IS NOT NULL AS "exists"
    `)) as Array<{ exists: boolean }>;

    if (!usersTableExists) {
      throw new Error(
        'users table does not exist; run earlier migrations first (CreateUsersTable, etc.)',
      );
    }

    const [{ duplicateGroups, affectedRows }] = (await queryRunner.query(`
      SELECT
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT LOWER("email") AS le
            FROM "users"
            GROUP BY le
            HAVING COUNT(*) > 1
          ) g
        ) AS "duplicateGroups",
        (
          SELECT COALESCE(SUM(cnt), 0)::int
          FROM (
            SELECT COUNT(*)::int AS cnt
            FROM "users"
            GROUP BY LOWER("email")
            HAVING COUNT(*) > 1
          ) s
        ) AS "affectedRows"
    `)) as Array<{ duplicateGroups: number; affectedRows: number }>;

    if (Number(duplicateGroups) > 0) {
      throw new Error(
        `Cannot create case-insensitive unique index: ${duplicateGroups} case-insensitive duplicate email group(s) involving ${affectedRows} row(s). Resolve duplicates first (PII not logged).`,
      );
    }

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email_lower" ON "users" (LOWER("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email_lower"`);
  }
}
