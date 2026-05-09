import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBrokerALocalAgentDetails1775740800000
  implements MigrationInterface
{
  name = 'CreateBrokerALocalAgentDetails1775740800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const users = `"${schema}"."users"`;
    const transactions = `"${schema}"."transactions"`;
    const table = `"${schema}"."broker_a_local_agent_details"`;

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ${table} (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "transaction_id" uuid NOT NULL,
        "organization_name" character varying(255) NOT NULL,
        "forwarding_value" numeric(18,2) NOT NULL,
        "local_agent_name" character varying(255) NOT NULL,
        "local_agent_phone" character varying(40) NOT NULL,
        "coordination_method" character varying(120) NOT NULL,
        "submitted_by" uuid NOT NULL,
        "submitted_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_broker_a_local_agent_details" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_broker_a_local_agent_details_transaction" UNIQUE ("transaction_id"),
        CONSTRAINT "FK_bald_transaction" FOREIGN KEY ("transaction_id") REFERENCES ${transactions}("id") ON DELETE CASCADE,
        CONSTRAINT "FK_bald_submitted_by" FOREIGN KEY ("submitted_by") REFERENCES ${users}("id") ON DELETE RESTRICT,
        CONSTRAINT "CHK_bald_forwarding_value_positive" CHECK ("forwarding_value" > 0)
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema =
      (queryRunner.connection.options as { schema?: string }).schema ??
      'public';
    const table = `"${schema}"."broker_a_local_agent_details"`;

    await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
  }
}
