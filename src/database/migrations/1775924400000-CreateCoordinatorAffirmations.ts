import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCoordinatorAffirmations1775924400000
  implements MigrationInterface
{
  name = 'CreateCoordinatorAffirmations1775924400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const transactions = `"${schema}"."transactions"`;
    const users = `"${schema}"."users"`;
    const affirmations = `"${schema}"."coordinator_affirmations"`;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${affirmations} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "transaction_id" uuid NOT NULL,
        "coordinator_id" uuid NOT NULL,
        "coordinator_comment" text,
        "affirmed_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_coordinator_affirmations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_coordinator_affirmations_transaction" FOREIGN KEY ("transaction_id") REFERENCES ${transactions}("id") ON DELETE CASCADE,
        CONSTRAINT "FK_coordinator_affirmations_coordinator" FOREIGN KEY ("coordinator_id") REFERENCES ${users}("id") ON DELETE RESTRICT,
        CONSTRAINT "UQ_coordinator_affirmations_transaction_id" UNIQUE ("transaction_id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_coordinator_affirmations_coordinator_id"
      ON ${affirmations} ("coordinator_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const affirmations = `"${schema}"."coordinator_affirmations"`;
    await queryRunner.query(`DROP TABLE IF EXISTS ${affirmations}`);
  }
}
