import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecipientExtendedProfileColumns1776000000000
  implements MigrationInterface
{
  name = 'AddRecipientExtendedProfileColumns1776000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const table = `"${schema}"."recipients"`;

    await queryRunner.query(`
      ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS "organization_name" character varying(255),
        ADD COLUMN IF NOT EXISTS "email" character varying(320),
        ADD COLUMN IF NOT EXISTS "whatsapp_number" character varying(32),
        ADD COLUMN IF NOT EXISTS "country_code" character varying(2),
        ADD COLUMN IF NOT EXISTS "state_province_code" character varying(32),
        ADD COLUMN IF NOT EXISTS "address_line_1" character varying(500),
        ADD COLUMN IF NOT EXISTS "address_line_2" character varying(500),
        ADD COLUMN IF NOT EXISTS "city_town" character varying(255),
        ADD COLUMN IF NOT EXISTS "zip_code" character varying(32)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const table = `"${schema}"."recipients"`;

    await queryRunner.query(`
      ALTER TABLE ${table}
        DROP COLUMN IF EXISTS "zip_code",
        DROP COLUMN IF EXISTS "city_town",
        DROP COLUMN IF EXISTS "address_line_2",
        DROP COLUMN IF EXISTS "address_line_1",
        DROP COLUMN IF EXISTS "state_province_code",
        DROP COLUMN IF EXISTS "country_code",
        DROP COLUMN IF EXISTS "whatsapp_number",
        DROP COLUMN IF EXISTS "email",
        DROP COLUMN IF EXISTS "organization_name"
    `);
  }
}
