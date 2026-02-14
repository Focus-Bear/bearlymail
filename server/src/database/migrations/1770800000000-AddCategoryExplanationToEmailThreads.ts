import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddCategoryExplanationToEmailThreads1770800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "email_threads",
      new TableColumn({
        name: "categoryExplanation",
        type: "text",
        isNullable: true,
        comment:
          "Explanation of why this category was chosen (especially useful for Other)",
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("email_threads", "categoryExplanation");
  }
}
