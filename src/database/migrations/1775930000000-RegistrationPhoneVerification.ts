import { MigrationInterface, QueryRunner } from 'typeorm';

export class RegistrationPhoneVerification1775930000000
  implements MigrationInterface
{
  name = 'RegistrationPhoneVerification1775930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const sessions = `"${schema}"."registration_sessions"`;
    const profiles = `"${schema}"."user_profiles"`;

    await queryRunner.query(
      `ALTER TABLE ${sessions} RENAME COLUMN "whatsapp_verification_status" TO "phone_verification_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} RENAME COLUMN "whatsapp_verification_sent_at" TO "phone_verification_sent_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} RENAME COLUMN "whatsapp_verified_at" TO "phone_verified_at"`,
    );

    await queryRunner.query(
      `ALTER TABLE ${sessions} ADD COLUMN IF NOT EXISTS "phone_verification_resend_count" integer NOT NULL DEFAULT 0`,
    );

    await queryRunner.query(
      `UPDATE ${sessions} SET "current_step" = 'awaiting_phone_verification' WHERE "current_step" = 'awaiting_whatsapp_verification'`,
    );

    await queryRunner.query(
      `ALTER TABLE ${profiles} RENAME COLUMN "normalized_whatsapp_number" TO "contact_phone_e164"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${profiles} DROP COLUMN IF EXISTS "whatsapp_country_code"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${profiles} DROP COLUMN IF EXISTS "whatsapp_number"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const sessions = `"${schema}"."registration_sessions"`;
    const profiles = `"${schema}"."user_profiles"`;

    await queryRunner.query(
      `ALTER TABLE ${profiles} ADD COLUMN IF NOT EXISTS "whatsapp_country_code" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE ${profiles} ADD COLUMN IF NOT EXISTS "whatsapp_number" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE ${profiles} RENAME COLUMN "contact_phone_e164" TO "normalized_whatsapp_number"`,
    );

    await queryRunner.query(
      `UPDATE ${sessions} SET "current_step" = 'awaiting_whatsapp_verification' WHERE "current_step" = 'awaiting_phone_verification'`,
    );

    await queryRunner.query(
      `ALTER TABLE ${sessions} DROP COLUMN IF EXISTS "phone_verification_resend_count"`,
    );

    await queryRunner.query(
      `ALTER TABLE ${sessions} RENAME COLUMN "phone_verification_status" TO "whatsapp_verification_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} RENAME COLUMN "phone_verification_sent_at" TO "whatsapp_verification_sent_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${sessions} RENAME COLUMN "phone_verified_at" TO "whatsapp_verified_at"`,
    );
  }
}
