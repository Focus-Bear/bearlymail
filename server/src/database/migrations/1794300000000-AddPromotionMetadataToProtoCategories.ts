import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPromotionMetadataToProtoCategories1794300000000
  implements MigrationInterface
{
  name = "AddPromotionMetadataToProtoCategories1794300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "proto_categories" ADD COLUMN IF NOT EXISTS "promotedAt" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "proto_categories" ADD COLUMN IF NOT EXISTS "promotionReasoning" TEXT`,
    );
    await queryRunner.query(
      `ALTER TABLE "proto_categories" ADD COLUMN IF NOT EXISTS "duplicateCandidates" TEXT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "proto_categories" DROP COLUMN IF EXISTS "duplicateCandidates"`,
    );
    await queryRunner.query(
      `ALTER TABLE "proto_categories" DROP COLUMN IF EXISTS "promotionReasoning"`,
    );
    await queryRunner.query(
      `ALTER TABLE "proto_categories" DROP COLUMN IF EXISTS "promotedAt"`,
    );
  }
}
