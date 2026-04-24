import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsersEmailCaseInsensitiveIndex1745242000000
  implements MigrationInterface
{
  name = 'AddUsersEmailCaseInsensitiveIndex1745242000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [summary] = (await queryRunner.query(`
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

    const duplicateGroups = Number(summary?.duplicateGroups ?? 0);
    const affectedRows = Number(summary?.affectedRows ?? 0);

    if (duplicateGroups > 0) {
      throw new Error(
        `Cannot lowercase existing user emails: ${duplicateGroups} case-insensitive duplicate email group(s) involving ${affectedRows} row(s). Resolve duplicates before re-running this migration. (PII omitted from logs.)`,
      );
    }

    await queryRunner.query(`UPDATE "users" SET "email" = LOWER("email")`);

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email_lower" ON "users" (LOWER("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email_lower"`);
  }
}
