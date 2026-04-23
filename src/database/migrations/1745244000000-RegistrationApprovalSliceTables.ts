import { MigrationInterface, QueryRunner } from 'typeorm';

export class RegistrationApprovalSliceTables1745244000000
  implements MigrationInterface
{
  name = 'RegistrationApprovalSliceTables1745244000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_profiles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "organization_name" character varying(255),
        "country" character varying(255),
        "state_province" character varying(255),
        "address_line_1" character varying(512),
        "address_line_2" character varying(512),
        "city_town" character varying(255),
        "zip_code" character varying(32),
        "phone_number" character varying(64),
        "whatsapp_country_code" character varying(16),
        "whatsapp_number" character varying(64),
        "normalized_whatsapp_number" character varying(32),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_profiles" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_profiles_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_user_profiles_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "verification_status_enum" AS ENUM (
        'unverified',
        'pending',
        'verified',
        'failed'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "approval_request_status_enum" AS ENUM (
        'pending',
        'approved',
        'rejected',
        'cancelled'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "registration_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "selected_role" "user_role_enum",
        "current_step" character varying(64),
        "contact_payload" jsonb,
        "personal_info_payload" jsonb,
        "location_payload" jsonb,
        "recipient_details_payload" jsonb,
        "verification_status" "verification_status_enum" NOT NULL DEFAULT 'unverified',
        "expires_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_registration_sessions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_registration_sessions_expires_at" ON "registration_sessions" ("expires_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "approval_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "request_type" character varying(128) NOT NULL,
        "status" "approval_request_status_enum" NOT NULL,
        "rejection_reason" text,
        "reviewed_by" uuid,
        "reviewed_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_approval_requests" PRIMARY KEY ("id"),
        CONSTRAINT "FK_approval_requests_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_approval_requests_reviewed_by" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_approval_requests_status_created_at" ON "approval_requests" ("status", "created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "actor_user_id" uuid,
        "actor_type" character varying(64) NOT NULL,
        "entity_type" character varying(128) NOT NULL,
        "entity_id" uuid NOT NULL,
        "action_type" character varying(128) NOT NULL,
        "old_values" jsonb,
        "new_values" jsonb,
        "metadata" jsonb,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_actor_user_id" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entity" ON "audit_logs" ("entity_type", "entity_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_audit_logs_entity"`);
    await queryRunner.query(`DROP TABLE "audit_logs"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_approval_requests_status_created_at"`,
    );
    await queryRunner.query(`DROP TABLE "approval_requests"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_registration_sessions_expires_at"`,
    );
    await queryRunner.query(`DROP TABLE "registration_sessions"`);

    await queryRunner.query(`DROP TYPE "approval_request_status_enum"`);
    await queryRunner.query(`DROP TYPE "verification_status_enum"`);

    await queryRunner.query(`DROP TABLE "user_profiles"`);
  }
}
