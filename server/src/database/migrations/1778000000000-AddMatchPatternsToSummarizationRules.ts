import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddMatchPatternsToSummarizationRules1778000000000 implements MigrationInterface {
  name = "AddMatchPatternsToSummarizationRules1778000000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "summarization_rules",
      new TableColumn({
        name: "from_patterns",
        type: "text",
        isArray: true,
        default: "'{}'",
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      "summarization_rules",
      new TableColumn({
        name: "subject_patterns",
        type: "text",
        isArray: true,
        default: "'{}'",
        isNullable: false,
      }),
    );

    await queryRunner.addColumn(
      "summarization_rules",
      new TableColumn({
        name: "priority",
        type: "integer",
        default: "0",
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn("summarization_rules", "priority");
    await queryRunner.dropColumn("summarization_rules", "subject_patterns");
    await queryRunner.dropColumn("summarization_rules", "from_patterns");
  }
}
