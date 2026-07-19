import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddEmailIdsToTokenUsage1771300000000 implements MigrationInterface {
  name = "AddEmailIdsToTokenUsage1771300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add emailIds column to token_usage table for tracking which emails were processed
    // This enables detection of duplicate email summarizations
    await queryRunner.addColumn(
      "token_usage",
      new TableColumn({
        name: "emailIds",
        type: "jsonb",
        isNullable: true,
      }),
    );

    // Add an index on emailIds for efficient duplicate detection queries
    // Using GIN index for JSONB array containment queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_token_usage_emailIds" 
      ON "token_usage" USING gin ("emailIds")
      WHERE "emailIds" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_token_usage_emailIds"`);
    await queryRunner.dropColumn("token_usage", "emailIds");
  }
}
