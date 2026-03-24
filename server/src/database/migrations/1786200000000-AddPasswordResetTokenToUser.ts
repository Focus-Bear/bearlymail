import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddPasswordResetTokenToUser1786200000000 implements MigrationInterface {
  name = "AddPasswordResetTokenToUser1786200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns("users", [
      new TableColumn({
        name: "passwordResetToken",
        type: "varchar",
        isNullable: true,
        comment: "Hashed token for password reset (1 hour expiry)",
      }),
      new TableColumn({
        name: "passwordResetExpires",
        type: "timestamp",
        isNullable: true,
        comment: "Password reset token expiration (1 hour)",
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "passwordResetExpires");
    await queryRunner.dropColumn("users", "passwordResetToken");
  }
}
