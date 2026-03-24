import { MigrationInterface, QueryRunner, TableIndex } from "typeorm";

export class AddIndexOnPasswordResetToken1786300000000 implements MigrationInterface {
  name = "AddIndexOnPasswordResetToken1786300000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createIndex(
      "users",
      new TableIndex({
        name: "IDX_users_passwordResetToken",
        columnNames: ["passwordResetToken"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex("users", "IDX_users_passwordResetToken");
  }
}
