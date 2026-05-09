import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateExternalContactsAndBrokerBAssignments1775827200000
  implements MigrationInterface
{
  name = 'CreateExternalContactsAndBrokerBAssignments1775827200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const users = `"${schema}"."users"`;
    const transactions = `"${schema}"."transactions"`;
    const extTable = `"${schema}"."external_contacts"`;
    const assignTable = `"${schema}"."transaction_broker_b_assignments"`;

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          WHERE t.typname = 'broker_b_assignment_type_enum'
            AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')
        ) THEN
          CREATE TYPE "${schema}"."broker_b_assignment_type_enum" AS ENUM (
            'internal_user',
            'external_contact'
          );
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type t
          WHERE t.typname = 'broker_b_assignment_status_enum'
            AND t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = '${schema}')
        ) THEN
          CREATE TYPE "${schema}"."broker_b_assignment_status_enum" AS ENUM (
            'assigned',
            'accepted',
            'declined',
            'cancelled'
          );
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${extTable} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "contact_type" character varying(120) NOT NULL,
        "display_name" character varying(255) NOT NULL,
        "organization_name" character varying(255),
        "phone_number" character varying(40),
        "email" character varying(320),
        "preferred_channel" "${schema}"."notification_channel_enum",
        "status" character varying(120),
        CONSTRAINT "PK_external_contacts" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${assignTable} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "transaction_id" uuid NOT NULL,
        "assignment_type" "${schema}"."broker_b_assignment_type_enum" NOT NULL,
        "internal_user_id" uuid,
        "external_contact_id" uuid,
        "assignment_status" "${schema}"."broker_b_assignment_status_enum" NOT NULL,
        "assigned_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "responded_at" TIMESTAMP WITH TIME ZONE,
        "decline_reason" text,
        CONSTRAINT "PK_transaction_broker_b_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tbba_transaction" FOREIGN KEY ("transaction_id") REFERENCES ${transactions}("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tbba_internal_user" FOREIGN KEY ("internal_user_id") REFERENCES ${users}("id") ON DELETE RESTRICT,
        CONSTRAINT "FK_tbba_external_contact" FOREIGN KEY ("external_contact_id") REFERENCES ${extTable}("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_tbba_assignment_target" CHECK (
          (
            "assignment_type" = 'internal_user'
            AND "internal_user_id" IS NOT NULL
            AND "external_contact_id" IS NULL
          )
          OR
          (
            "assignment_type" = 'external_contact'
            AND "external_contact_id" IS NOT NULL
            AND "internal_user_id" IS NULL
          )
        )
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tbba_transaction_id" ON ${assignTable} ("transaction_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tbba_internal_user_id" ON ${assignTable} ("internal_user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_tbba_external_contact_id" ON ${assignTable} ("external_contact_id")`,
    );

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_tbba_transaction_active_assigned"
      ON ${assignTable} ("transaction_id")
      WHERE "assignment_status" = 'assigned'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const assignTable = `"${schema}"."transaction_broker_b_assignments"`;
    const extTable = `"${schema}"."external_contacts"`;

    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."UQ_tbba_transaction_active_assigned"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_tbba_external_contact_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_tbba_internal_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_tbba_transaction_id"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS ${assignTable}`);
    await queryRunner.query(`DROP TABLE IF EXISTS ${extTable}`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "${schema}"."broker_b_assignment_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "${schema}"."broker_b_assignment_type_enum"`,
    );
  }
}
