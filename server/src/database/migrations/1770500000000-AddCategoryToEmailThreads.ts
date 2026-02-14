import {
  MigrationInterface,
  QueryRunner,
  TableColumn,
  TableIndex,
} from "typeorm";

export class AddCategoryToEmailThreads1770500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      "email_threads",
      new TableColumn({
        name: "category",
        type: "varchar",
        length: "100",
        isNullable: true,
        comment:
          "Email category for grouping (e.g., Newsletters, Customer Support)",
      }),
    );

    await queryRunner.createIndex(
      "email_threads",
      new TableIndex({
        name: "IDX_email_threads_userId_category",
        columnNames: ["userId", "category"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropIndex(
      "email_threads",
      "IDX_email_threads_userId_category",
    );
    await queryRunner.dropColumn("email_threads", "category");
  }
}
