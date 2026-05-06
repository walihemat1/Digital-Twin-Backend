import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegistrationVerification1775222400000
  implements MigrationInterface
{
  name = 'AddRegistrationVerification1775222400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const sessionsTable = `"${schema}"."registration_sessions"`;
    const verificationsTable = `"${schema}"."registration_verifications"`;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${verificationsTable} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "registration_session_id" uuid NOT NULL,
        "channel" "notification_channel_enum" NOT NULL,
        "code_hash" character varying(255) NOT NULL,
        "issued_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "verified_at" TIMESTAMP WITH TIME ZONE,
        "invalidated_at" TIMESTAMP WITH TIME ZONE,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "resend_count" integer NOT NULL DEFAULT 0,
        CONSTRAINT "PK_registration_verifications" PRIMARY KEY ("id"),
        CONSTRAINT "FK_registration_verifications_session" FOREIGN KEY ("registration_session_id") REFERENCES ${sessionsTable}("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_registration_verifications_session_channel" ON ${verificationsTable} ("registration_session_id","channel","issued_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE ${sessionsTable} ADD COLUMN IF NOT EXISTS "whatsapp_verification_status" "verification_status_enum" NOT NULL DEFAULT 'unverified'`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessionsTable} ADD COLUMN IF NOT EXISTS "email_verification_status" "verification_status_enum" NOT NULL DEFAULT 'unverified'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const sessionsTable = `"${schema}"."registration_sessions"`;
    const verificationsTable = `"${schema}"."registration_verifications"`;

    await queryRunner.query(
      `ALTER TABLE ${sessionsTable} DROP COLUMN IF EXISTS "email_verification_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessionsTable} DROP COLUMN IF EXISTS "whatsapp_verification_status"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_registration_verifications_session_channel"`,
    );
    await queryRunner.query(
      `DROP TABLE IF EXISTS ${verificationsTable}`,
    );
  }
}
