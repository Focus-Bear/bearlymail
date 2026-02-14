import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddLastModifiedToUserContext1765844924193 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const userContextsTable = await queryRunner.getTable("user_contexts");
    if (userContextsTable) {
      const hasLastModified =
        userContextsTable.findColumnByName("lastModified");
      if (!hasLastModified) {
        await queryRunner.addColumn(
          "user_contexts",
          new TableColumn({
            name: "lastModified",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            onUpdate: "CURRENT_TIMESTAMP",
          }),
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const userContextsTable = await queryRunner.getTable("user_contexts");
    if (userContextsTable) {
      const hasLastModified =
        userContextsTable.findColumnByName("lastModified");
      if (hasLastModified) {
        await queryRunner.dropColumn("user_contexts", "lastModified");
      }
    }
  }
}
