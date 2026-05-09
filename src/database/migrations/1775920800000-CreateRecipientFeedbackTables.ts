import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRecipientFeedbackTables1775920800000
  implements MigrationInterface
{
  name = 'CreateRecipientFeedbackTables1775920800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const transactions = `"${schema}"."transactions"`;
    const recipients = `"${schema}"."recipients"`;
    const feedback = `"${schema}"."recipient_feedback"`;
    const accessTokens = `"${schema}"."recipient_feedback_access_tokens"`;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${feedback} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "transaction_id" uuid NOT NULL,
        "recipient_id" uuid NOT NULL,
        "feedback_comment" text,
        "actual_amount_received" numeric(18,2) NOT NULL,
        "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "source_channel" "${schema}"."notification_channel_enum",
        CONSTRAINT "PK_recipient_feedback" PRIMARY KEY ("id"),
        CONSTRAINT "FK_recipient_feedback_transaction" FOREIGN KEY ("transaction_id") REFERENCES ${transactions}("id") ON DELETE CASCADE,
        CONSTRAINT "FK_recipient_feedback_recipient" FOREIGN KEY ("recipient_id") REFERENCES ${recipients}("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_recipient_feedback_transaction_id" UNIQUE ("transaction_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_recipient_feedback_recipient_id"
      ON ${feedback} ("recipient_id")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${accessTokens} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "transaction_id" uuid NOT NULL,
        "recipient_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "invalidated_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_recipient_feedback_access_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_rfat_transaction" FOREIGN KEY ("transaction_id") REFERENCES ${transactions}("id") ON DELETE CASCADE,
        CONSTRAINT "FK_rfat_recipient" FOREIGN KEY ("recipient_id") REFERENCES ${recipients}("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_rfat_token_hash" UNIQUE ("token_hash")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rfat_transaction_id"
      ON ${accessTokens} ("transaction_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_rfat_expires_at"
      ON ${accessTokens} ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const feedback = `"${schema}"."recipient_feedback"`;
    const accessTokens = `"${schema}"."recipient_feedback_access_tokens"`;

    await queryRunner.query(`DROP TABLE IF EXISTS ${accessTokens}`);
    await queryRunner.query(`DROP TABLE IF EXISTS ${feedback}`);
  }
}
