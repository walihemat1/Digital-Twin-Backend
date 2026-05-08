import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTransactionsAndStatusHistory1775654400000
  implements MigrationInterface
{
  name = 'CreateTransactionsAndStatusHistory1775654400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const users = `"${schema}"."users"`;
    const recipients = `"${schema}"."recipients"`;
    const transactions = `"${schema}"."transactions"`;
    const history = `"${schema}"."transaction_status_history"`;

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          WHERE t.typname = 'transaction_status_enum'
            AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')
        ) THEN
          CREATE TYPE "${schema}"."transaction_status_enum" AS ENUM (
            'pending',
            'broker_a_accepted',
            'broker_a_declined',
            'awaiting_broker_b',
            'broker_b_accepted',
            'broker_b_declined',
            'delivered',
            'feedback_submitted',
            'completed',
            'cancelled'
          );
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${transactions} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "coordinator_id" uuid NOT NULL,
        "recipient_id" uuid NOT NULL,
        "broker_a_user_id" uuid NOT NULL,
        "transfer_method" character varying(120) NOT NULL,
        "verification_method" character varying(120) NOT NULL,
        "amount" numeric(18,2) NOT NULL,
        "currency" character varying(12) NOT NULL DEFAULT 'USD',
        "description" text,
        "status" "${schema}"."transaction_status_enum" NOT NULL,
        "current_stage" character varying(120),
        "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "delivery_confirmed_at" TIMESTAMP WITH TIME ZONE,
        "completed_at" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_transactions_coordinator" FOREIGN KEY ("coordinator_id") REFERENCES ${users}("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_transactions_recipient" FOREIGN KEY ("recipient_id") REFERENCES ${recipients}("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_transactions_broker_a" FOREIGN KEY ("broker_a_user_id") REFERENCES ${users}("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_transactions_amount_positive" CHECK ("amount" > 0)
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_coordinator_id" ON ${transactions} ("coordinator_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_recipient_id" ON ${transactions} ("recipient_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_broker_a_user_id" ON ${transactions} ("broker_a_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_status" ON ${transactions} ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transactions_submitted_at" ON ${transactions} ("submitted_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${history} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transaction_id" uuid NOT NULL,
        "from_status" "${schema}"."transaction_status_enum",
        "to_status" "${schema}"."transaction_status_enum" NOT NULL,
        "changed_by_user_id" uuid,
        "change_reason" text,
        "metadata" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transaction_status_history" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tsh_transaction" FOREIGN KEY ("transaction_id") REFERENCES ${transactions}("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tsh_changed_by" FOREIGN KEY ("changed_by_user_id") REFERENCES ${users}("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_transaction_status_history_transaction_created" ON ${history} ("transaction_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const history = `"${schema}"."transaction_status_history"`;
    const transactions = `"${schema}"."transactions"`;

    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_transaction_status_history_transaction_created"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS ${history}`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_transactions_submitted_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_transactions_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_transactions_broker_a_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_transactions_recipient_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_transactions_coordinator_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS ${transactions}`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "${schema}"."transaction_status_enum"`,
    );
  }
}
