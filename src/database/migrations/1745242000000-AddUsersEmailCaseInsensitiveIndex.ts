import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsersEmailCaseInsensitiveIndex1745242000000 implements MigrationInterface {
  name = 'AddUsersEmailCaseInsensitiveIndex1745242000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const duplicates = await queryRunner.query(`
      SELECT LOWER(email) AS normalized_email, ARRAY_AGG(email) AS original_emails
      FROM "users"
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
    `);

    if (duplicates.length > 0) {
      throw new Error(
        `Cannot lowercase existing user emails because case-insensitive duplicates exist: ${JSON.stringify(duplicates)}`,
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
