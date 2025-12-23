import { MigrationInterface, QueryRunner } from "typeorm";

export class DropPriorityRulesTable1735272000004 implements MigrationInterface {
  name = "DropPriorityRulesTable1735272000004";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop the priority_rules table as we're now using context for prioritization
    await queryRunner.query(`DROP TABLE IF EXISTS "priority_rules"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recreate the priority_rules table if needed
    await queryRunner.query(`
            CREATE TABLE "priority_rules" (
                "ruleId" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "userId" uuid NOT NULL,
                "ruleType" character varying NOT NULL,
                "conditionKey" text NOT NULL,
                "conditionVal" text NOT NULL,
                "priorityBoost" integer NOT NULL,
                "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_priority_rules_id" PRIMARY KEY ("ruleId")
            )
        `);
    await queryRunner.query(
      `ALTER TABLE "priority_rules" ADD CONSTRAINT "FK_priority_rules_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }
}
