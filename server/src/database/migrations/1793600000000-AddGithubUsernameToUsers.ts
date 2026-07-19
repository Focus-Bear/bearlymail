import { MigrationInterface, QueryRunner } from "typeorm";

export class AddGithubUsernameToUsers1793600000000
  implements MigrationInterface
{
  name = "AddGithubUsernameToUsers1793600000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "githubUsername" TEXT`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "githubUsername"`,
    );
  }
}
