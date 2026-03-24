import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCorrelationIdToContextAnalysis1775000000000 implements MigrationInterface {
  name = "AddCorrelationIdToContextAnalysis1775000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "context_analyses" ADD COLUMN IF NOT EXISTS "correlationId" varchar(36)`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_context_analyses_correlationId" ON "context_analyses" ("correlationId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_context_analyses_correlationId"`,
    );

    await queryRunner.query(
      `ALTER TABLE "context_analyses" DROP COLUMN IF EXISTS "correlationId"`,
    );
  }
}
