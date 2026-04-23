import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUsersEmailCaseInsensitiveIndex1745242000000
  implements MigrationInterface
{
  name = 'AddUsersEmailCaseInsensitiveIndex1745242000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`UPDATE "users" SET "email" = LOWER("email")`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_users_email_lower" ON "users" (LOWER("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_users_email_lower"`);
  }
}
