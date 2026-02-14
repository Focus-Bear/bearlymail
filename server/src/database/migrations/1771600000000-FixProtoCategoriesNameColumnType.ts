import { MigrationInterface, QueryRunner } from "typeorm";

export class FixProtoCategoriesNameColumnType1771600000000 implements MigrationInterface {
  name = "FixProtoCategoriesNameColumnType1771600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Change proto_categories.name from varchar(100) to text to match entity
    // This is needed because encrypted values can be longer than 100 characters
    await queryRunner.query(`
      ALTER TABLE "proto_categories" 
      ALTER COLUMN "name" TYPE text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert back to varchar(100) - note this may truncate data
    await queryRunner.query(`
      ALTER TABLE "proto_categories" 
      ALTER COLUMN "name" TYPE varchar(100)
    `);
  }
}
