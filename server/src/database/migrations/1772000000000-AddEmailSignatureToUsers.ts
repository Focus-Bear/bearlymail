import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddEmailSignatureToUsers1772000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "users",
      new TableColumn({
        name: "emailSignature",
        type: "text",
        isNullable: true,
        comment:
          "User's email signature (encrypted). Default: 'Sent from BearlyMail (anti inbox overwhelm system)'",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("users", "emailSignature");
  }
}
