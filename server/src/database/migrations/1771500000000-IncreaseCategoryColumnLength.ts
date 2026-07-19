import { MigrationInterface, QueryRunner } from "typeorm";

export class IncreaseCategoryColumnLength1771500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ALTER COLUMN "category" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_overrides" ALTER COLUMN "originalCategory" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_overrides" ALTER COLUMN "userCategory" TYPE text`,
    );
    await queryRunner.query(
      `ALTER TABLE "proto_categories" ALTER COLUMN "name" TYPE text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_threads" ALTER COLUMN "category" TYPE varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_overrides" ALTER COLUMN "originalCategory" TYPE varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "category_overrides" ALTER COLUMN "userCategory" TYPE varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "proto_categories" ALTER COLUMN "name" TYPE varchar(100)`,
    );
  }
}
