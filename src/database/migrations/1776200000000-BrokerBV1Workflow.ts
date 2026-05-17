import { MigrationInterface, QueryRunner } from 'typeorm';

export class BrokerBV1Workflow1776200000000 implements MigrationInterface {
  name = 'BrokerBV1Workflow1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = process.env.DB_SCHEMA ?? 'public';
    const authCodes = `"${schema}"."transaction_auth_codes"`;
    const attempts = `"${schema}"."transaction_delivery_verification_attempts"`;

    await queryRunner.query(`
      ALTER TABLE ${authCodes}
      ADD COLUMN IF NOT EXISTS "code_encrypted" text NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${attempts} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "transaction_id" uuid NOT NULL,
        "broker_b_user_id" uuid NOT NULL,
        "failure_reason" varchar(64) NOT NULL,
        "code_valid" boolean NULL,
        "amount_valid" boolean NULL,
        CONSTRAINT "PK_transaction_delivery_verification_attempts" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tdva_transaction" FOREIGN KEY ("transaction_id")
          REFERENCES "${schema}"."transactions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_tdva_broker_b_user" FOREIGN KEY ("broker_b_user_id")
          REFERENCES "${schema}"."users"("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tdva_transaction_id"
      ON ${attempts} ("transaction_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_tdva_created_at"
      ON ${attempts} ("created_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = process.env.DB_SCHEMA ?? 'public';
    const authCodes = `"${schema}"."transaction_auth_codes"`;
    const attempts = `"${schema}"."transaction_delivery_verification_attempts"`;

    await queryRunner.query(`DROP TABLE IF EXISTS ${attempts}`);
    await queryRunner.query(`
      ALTER TABLE ${authCodes}
      DROP COLUMN IF EXISTS "code_encrypted"
    `);
  }
}
