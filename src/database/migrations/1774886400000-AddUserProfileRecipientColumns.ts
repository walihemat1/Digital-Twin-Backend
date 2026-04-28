import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserProfileRecipientColumns1774886400000
  implements MigrationInterface
{
  name = 'AddUserProfileRecipientColumns1774886400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const table = `"${schema}"."user_profiles"`;

    await queryRunner.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "issuing_country" character varying(120)`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS "identification_number" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const table = `"${schema}"."user_profiles"`;

    await queryRunner.query(
      `ALTER TABLE ${table} DROP COLUMN IF EXISTS "identification_number"`,
    );
    await queryRunner.query(
      `ALTER TABLE ${table} DROP COLUMN IF EXISTS "issuing_country"`,
    );
  }
}
