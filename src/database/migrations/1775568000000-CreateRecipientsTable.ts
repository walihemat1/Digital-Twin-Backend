import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRecipientsTable1775568000000 implements MigrationInterface {
  name = 'CreateRecipientsTable1775568000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const table = `"${schema}"."recipients"`;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "first_name" character varying(255) NOT NULL,
        "last_name" character varying(255) NOT NULL,
        "phone_number" character varying(32) NOT NULL,
        "normalized_phone" character varying(32) NOT NULL,
        "issuing_country" character varying(120),
        "identification_number_encrypted" text,
        "verification_status" "${schema}"."verification_status_enum" NOT NULL DEFAULT 'unverified',
        "is_active" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_recipients" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_recipients_normalized_phone" ON ${table} ("normalized_phone")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_recipients_verification_status" ON ${table} ("verification_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const table = `"${schema}"."recipients"`;

    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_recipients_verification_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${schema}"."IDX_recipients_normalized_phone"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
  }
}
