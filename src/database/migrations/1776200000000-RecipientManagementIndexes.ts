import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecipientManagementIndexes1776200000000
  implements MigrationInterface
{
  name = 'RecipientManagementIndexes1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const recipients = `"${schema}"."recipients"`;

    await queryRunner.query(`
      ALTER TABLE ${recipients}
        ADD COLUMN IF NOT EXISTS "identification_number_hash" varchar(64)
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_recipients_identification_number_hash"
      ON ${recipients} ("identification_number_hash")
      WHERE "identification_number_hash" IS NOT NULL
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_recipients_email_lower"
      ON ${recipients} (LOWER("email"))
      WHERE "email" IS NOT NULL AND TRIM("email") <> ''
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const recipients = `"${schema}"."recipients"`;

    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."UQ_recipients_email_lower"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "${schema}"."UQ_recipients_identification_number_hash"
    `);
    await queryRunner.query(`
      ALTER TABLE ${recipients}
        DROP COLUMN IF EXISTS "identification_number_hash"
    `);
  }
}
