import { MigrationInterface, QueryRunner } from "typeorm";

export class RemoveBatchDeliveryHours1766400000000 implements MigrationInterface {
  name = "RemoveBatchDeliveryHours1766400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if column exists before dropping
    const table = await queryRunner.getTable("users");
    if (table && table.findColumnByName("batchDeliveryHours")) {
      await queryRunner.query(
        `ALTER TABLE "users" DROP COLUMN IF EXISTS "batchDeliveryHours"`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Re-add the column if rolling back
    const table = await queryRunner.getTable("users");
    if (table && !table.findColumnByName("batchDeliveryHours")) {
      await queryRunner.query(
        `ALTER TABLE "users" ADD COLUMN "batchDeliveryHours" integer DEFAULT 6`,
      );
    }
  }
}
