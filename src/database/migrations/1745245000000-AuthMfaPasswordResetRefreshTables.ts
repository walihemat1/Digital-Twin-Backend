import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuthMfaPasswordResetRefreshTables1745245000000 implements MigrationInterface {
  name = 'AuthMfaPasswordResetRefreshTables1745245000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "notification_channel_enum" AS ENUM (
          'email', 'sms', 'whatsapp', 'in_app'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE "mfa_challenges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "code_hash" character varying(255) NOT NULL,
        "delivery_channel" "notification_channel_enum" NOT NULL,
        "issued_at" TIMESTAMPTZ NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "verified_at" TIMESTAMPTZ,
        "invalidated_at" TIMESTAMPTZ,
        "attempt_count" integer NOT NULL DEFAULT 0,
        "resend_count" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mfa_challenges" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mfa_challenges_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_mfa_challenges_user_id_issued" ON "mfa_challenges" ("user_id", "issued_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "password_reset_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "used_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_password_reset_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_password_reset_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_password_reset_tokens_user_id" ON "password_reset_tokens" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL,
        "token_hash" character varying(64) NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        "issued_at" TIMESTAMPTZ NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "FK_refresh_tokens_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_user_id"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_password_reset_tokens_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "password_reset_tokens"`);

    await queryRunner.query(
      `DROP INDEX "public"."IDX_mfa_challenges_user_id_issued"`,
    );
    await queryRunner.query(`DROP TABLE "mfa_challenges"`);

    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."notification_channel_enum"`,
    );
  }
}
