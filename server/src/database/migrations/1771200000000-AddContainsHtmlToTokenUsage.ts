import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddContainsHtmlToTokenUsage1771200000000 implements MigrationInterface {
  name = "AddContainsHtmlToTokenUsage1771200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add containsHtml column to token_usage table
    await queryRunner.addColumn(
      "token_usage",
      new TableColumn({
        name: "containsHtml",
        type: "boolean",
        default: false,
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("token_usage", "containsHtml");
  }
}
