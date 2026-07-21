import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCreationReasoningToProtoCategories1795700000000
  implements MigrationInterface
{
  name = "AddCreationReasoningToProtoCategories1795700000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "proto_categories" ADD COLUMN IF NOT EXISTS "creationReasoning" TEXT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "proto_categories" DROP COLUMN IF EXISTS "creationReasoning"`,
    );
  }
}
