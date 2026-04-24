import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConvertUsersRoleStatusToEnum1745243000000 implements MigrationInterface {
  name = 'ConvertUsersRoleStatusToEnum1745243000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "user_role_enum" AS ENUM (
        'coordinator_sender',
        'broker_a',
        'broker_b',
        'admin',
        'organization'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "user_account_status_enum" AS ENUM (
        'pending_registration',
        'pending_approval',
        'active',
        'suspended',
        'rejected',
        'disabled'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "role" TYPE "user_role_enum" USING "role"::"user_role_enum",
      ALTER COLUMN "account_status" TYPE "user_account_status_enum" USING "account_status"::"user_account_status_enum"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
      ALTER COLUMN "role" TYPE character varying(64) USING "role"::text,
      ALTER COLUMN "account_status" TYPE character varying(64) USING "account_status"::text
    `);

    await queryRunner.query(`DROP TYPE "user_account_status_enum"`);
    await queryRunner.query(`DROP TYPE "user_role_enum"`);
  }
}
