import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegistrationVerification1775136000000
  implements MigrationInterface
{
  name = 'AddRegistrationVerification1775136000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const sessions = `"${schema}"."registration_sessions"`;
    const codes = `"${schema}"."registration_verification_codes"`;

    // Extend enum for new statuses if they do not exist
    await queryRunner.query(
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'verification_status_enum' AND e.enumlabel = 'not_started') THEN
          ALTER TYPE "${schema}"."verification_status_enum" ADD VALUE 'not_started';
        END IF;
      END$$;`,
    );
    await queryRunner.query(
      `DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'verification_status_enum' AND e.enumlabel = 'expired') THEN
          ALTER TYPE "${schema}"."verification_status_enum" ADD VALUE 'expired';
        END IF;
      END$$;`,
    );

    await queryRunner.query(
      `ALTER TABLE ${sessions} ADD COLUMN IF NOT EXISTS "whatsapp_verification_status" "${schema}"."verification_status_enum" NOT NULL DEFAULT 'not_started'`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} ADD COLUMN IF NOT EXISTS "whatsapp_verification_sent_at" TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} ADD COLUMN IF NOT EXISTS "whatsapp_verified_at" TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} ADD COLUMN IF NOT EXISTS "email_verification_status" "${schema}"."verification_status_enum" NOT NULL DEFAULT 'not_started'`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} ADD COLUMN IF NOT EXISTS "email_verification_sent_at" TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} ADD COLUMN IF NOT EXISTS "email_verified_at" TIMESTAMPTZ`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS ${codes} (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "registration_session_id" uuid NOT NULL REFERENCES ${sessions}("id") ON DELETE CASCADE,
        "channel" "${schema}"."notification_channel_enum" NOT NULL,
        "code_hash" varchar(255) NOT NULL,
        "issued_at" TIMESTAMPTZ NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "verified_at" TIMESTAMPTZ,
        "invalidated_at" TIMESTAMPTZ,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "resend_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reg_verification_session_channel" ON ${codes} ("registration_session_id", "channel")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_reg_verification_expires_at" ON ${codes} ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const sessions = `"${schema}"."registration_sessions"`;
    const codes = `"${schema}"."registration_verification_codes"`;

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reg_verification_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_reg_verification_session_channel"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS ${codes}`);

    await queryRunner.query(
      `ALTER TABLE ${sessions} DROP COLUMN IF EXISTS "email_verified_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} DROP COLUMN IF EXISTS "email_verification_sent_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} DROP COLUMN IF EXISTS "email_verification_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} DROP COLUMN IF EXISTS "whatsapp_verified_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} DROP COLUMN IF EXISTS "whatsapp_verification_sent_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} DROP COLUMN IF EXISTS "whatsapp_verification_status"`,
    );
    // Enum rollback intentionally omitted to avoid issues with existing values.
  }
}
