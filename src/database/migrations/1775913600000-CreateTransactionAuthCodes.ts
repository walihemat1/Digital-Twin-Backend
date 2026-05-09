import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionAuthCodes1775913600000 implements MigrationInterface {
  name = 'CreateTransactionAuthCodes1775913600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const table = `"${schema}"."transaction_auth_codes"`;
    const transactions = `"${schema}"."transactions"`;
    const recipients = `"${schema}"."recipients"`;
    const assignments = `"${schema}"."transaction_broker_b_assignments"`;

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          WHERE t.typname = 'notification_delivery_status_enum'
            AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')
        ) THEN
          CREATE TYPE "${schema}"."notification_delivery_status_enum" AS ENUM (
            'pending',
            'sent',
            'delivered',
            'failed',
            'read'
          );
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "transaction_id" uuid NOT NULL,
        "recipient_id" uuid NOT NULL,
        "broker_b_assignment_id" uuid NOT NULL,
        "code_hash" character varying(255) NOT NULL,
        "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "invalidated_at" TIMESTAMP WITH TIME ZONE,
        "verified_at" TIMESTAMP WITH TIME ZONE,
        "delivery_status" "${schema}"."notification_delivery_status_enum",
        CONSTRAINT "PK_transaction_auth_codes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tac_transaction" FOREIGN KEY ("transaction_id") REFERENCES ${transactions}("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tac_recipient" FOREIGN KEY ("recipient_id") REFERENCES ${recipients}("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_tac_assignment" FOREIGN KEY ("broker_b_assignment_id") REFERENCES ${assignments}("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tac_transaction_id"
      ON ${table} ("transaction_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tac_expires_at"
      ON ${table} ("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const table = `"${schema}"."transaction_auth_codes"`;

    await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type t
          WHERE t.typname = 'notification_delivery_status_enum'
            AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')
        ) THEN
          DROP TYPE "${schema}"."notification_delivery_status_enum";
        END IF;
      END$$;
    `);
  }
}
