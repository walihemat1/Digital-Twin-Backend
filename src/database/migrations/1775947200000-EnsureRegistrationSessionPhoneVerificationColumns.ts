import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ensures registration_sessions uses phone_* verification columns.
 * Handles databases that still have whatsapp_* columns (migration 1775930000000 not applied)
 * or edge cases where neither set exists yet.
 */
export class EnsureRegistrationSessionPhoneVerificationColumns1775947200000
  implements MigrationInterface
{
  name = 'EnsureRegistrationSessionPhoneVerificationColumns1775947200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const sessions = `"${schema}"."registration_sessions"`;
    const profiles = `"${schema}"."user_profiles"`;

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = '${schema}'
            AND c.table_name = 'registration_sessions'
            AND c.column_name = 'whatsapp_verification_status'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = '${schema}'
            AND c.table_name = 'registration_sessions'
            AND c.column_name = 'phone_verification_status'
        ) THEN
          EXECUTE 'ALTER TABLE "${schema}"."registration_sessions" RENAME COLUMN "whatsapp_verification_status" TO "phone_verification_status"';
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = '${schema}'
            AND c.table_name = 'registration_sessions'
            AND c.column_name = 'whatsapp_verification_sent_at'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = '${schema}'
            AND c.table_name = 'registration_sessions'
            AND c.column_name = 'phone_verification_sent_at'
        ) THEN
          EXECUTE 'ALTER TABLE "${schema}"."registration_sessions" RENAME COLUMN "whatsapp_verification_sent_at" TO "phone_verification_sent_at"';
        END IF;
      END$$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = '${schema}'
            AND c.table_name = 'registration_sessions'
            AND c.column_name = 'whatsapp_verified_at'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = '${schema}'
            AND c.table_name = 'registration_sessions'
            AND c.column_name = 'phone_verified_at'
        ) THEN
          EXECUTE 'ALTER TABLE "${schema}"."registration_sessions" RENAME COLUMN "whatsapp_verified_at" TO "phone_verified_at"';
        END IF;
      END$$;
    `);

    await queryRunner.query(
      `ALTER TABLE ${sessions} ADD COLUMN IF NOT EXISTS "phone_verification_status" "${schema}"."verification_status_enum" NOT NULL DEFAULT 'not_started'`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} ADD COLUMN IF NOT EXISTS "phone_verification_sent_at" TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} ADD COLUMN IF NOT EXISTS "phone_verified_at" TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} ADD COLUMN IF NOT EXISTS "phone_verification_resend_count" integer NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(
      `UPDATE ${sessions} SET "current_step" = 'awaiting_phone_verification' WHERE "current_step" = 'awaiting_whatsapp_verification'`,
    );

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = '${schema}'
            AND c.table_name = 'user_profiles'
            AND c.column_name = 'normalized_whatsapp_number'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns c
          WHERE c.table_schema = '${schema}'
            AND c.table_name = 'user_profiles'
            AND c.column_name = 'contact_phone_e164'
        ) THEN
          EXECUTE 'ALTER TABLE "${schema}"."user_profiles" RENAME COLUMN "normalized_whatsapp_number" TO "contact_phone_e164"';
        END IF;
      END$$;
    `);

    await queryRunner.query(
      `ALTER TABLE ${profiles} DROP COLUMN IF EXISTS "whatsapp_country_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${profiles} DROP COLUMN IF EXISTS "whatsapp_number"`,
    );
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // Intentionally empty: aligns legacy schema with entities; reversing risks data loss.
  }
}
