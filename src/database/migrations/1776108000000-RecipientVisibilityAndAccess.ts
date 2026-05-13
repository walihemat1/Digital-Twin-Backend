import { MigrationInterface, QueryRunner } from 'typeorm';

export class RecipientVisibilityAndAccess1776108000000
  implements MigrationInterface
{
  name = 'RecipientVisibilityAndAccess1776108000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const recipients = `"${schema}"."recipients"`;
    const users = `"${schema}"."users"`;
    const transactions = `"${schema}"."transactions"`;
    const access = `"${schema}"."recipient_user_access"`;

    await queryRunner.query(`
      ALTER TABLE ${recipients}
        ADD COLUMN IF NOT EXISTS "created_by_user_id" uuid
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_recipients_created_by_user_id"
      ON ${recipients} ("created_by_user_id")
    `);

    await queryRunner.query(`
      ALTER TABLE ${recipients}
        ADD CONSTRAINT "FK_recipients_created_by_user"
        FOREIGN KEY ("created_by_user_id") REFERENCES ${users}("id")
        ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${access} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "recipient_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        CONSTRAINT "PK_recipient_user_access" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_recipient_user_access_recipient_user" UNIQUE ("recipient_id", "user_id"),
        CONSTRAINT "FK_recipient_user_access_recipient" FOREIGN KEY ("recipient_id") REFERENCES ${recipients}("id") ON DELETE CASCADE,
        CONSTRAINT "FK_recipient_user_access_user" FOREIGN KEY ("user_id") REFERENCES ${users}("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_recipient_user_access_user_id"
      ON ${access} ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_recipient_user_access_recipient_id"
      ON ${access} ("recipient_id")
    `);

    // Historical coordinators who used a recipient in a transaction may view/select that recipient.
    await queryRunner.query(`
      INSERT INTO ${access} ("recipient_id", "user_id")
      SELECT DISTINCT "recipient_id", "coordinator_id"
      FROM ${transactions}
      ON CONFLICT ("recipient_id", "user_id") DO NOTHING
    `);

    await queryRunner.query(`
      UPDATE ${recipients} r
      SET "created_by_user_id" = s."coordinator_id"
      FROM (
        SELECT DISTINCT ON ("recipient_id") "recipient_id", "coordinator_id"
        FROM ${transactions}
        ORDER BY "recipient_id", "submitted_at" ASC, "id" ASC
      ) s
      WHERE r."id" = s."recipient_id" AND r."created_by_user_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const recipients = `"${schema}"."recipients"`;
    const access = `"${schema}"."recipient_user_access"`;

    await queryRunner.query(`DROP TABLE IF EXISTS ${access}`);

    await queryRunner.query(
      `ALTER TABLE ${recipients} DROP CONSTRAINT IF EXISTS "FK_recipients_created_by_user"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_recipients_created_by_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${recipients} DROP COLUMN IF EXISTS "created_by_user_id"`,
    );
  }
}
