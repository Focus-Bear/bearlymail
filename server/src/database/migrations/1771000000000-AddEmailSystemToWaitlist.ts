import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailSystemToWaitlist1771000000000 implements MigrationInterface {
  name = "AddEmailSystemToWaitlist1771000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "waitlist" ADD "emailSystem" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "waitlist" ADD "emailSystemOther" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "waitlist" DROP COLUMN "emailSystemOther"`,
    );
    await queryRunner.query(`ALTER TABLE "waitlist" DROP COLUMN "emailSystem"`);
  }
}
