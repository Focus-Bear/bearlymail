import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class CreateBlockedKeywordsTable1770200000000 implements MigrationInterface {
  name = "CreateBlockedKeywordsTable1770200000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create blocked_keywords table
    const blockedKeywordsTableExists =
      await queryRunner.hasTable("blocked_keywords");
    if (!blockedKeywordsTableExists) {
      await queryRunner.createTable(
        new Table({
          name: "blocked_keywords",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            { name: "userId", type: "uuid" },
            { name: "keyword", type: "text" },
            { name: "keywordHash", type: "varchar", length: "64" },
            { name: "exactMatch", type: "boolean", default: false },
            { name: "reason", type: "text", isNullable: true },
            {
              name: "blockedAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
          foreignKeys: [
            {
              columnNames: ["userId"],
              referencedTableName: "users",
              referencedColumnNames: ["id"],
              onDelete: "CASCADE",
            },
          ],
        }),
        true,
      );

      // Create unique index on userId + keywordHash
      await queryRunner.createIndex(
        "blocked_keywords",
        new TableIndex({
          name: "IDX_blocked_keywords_userId_keywordHash",
          columnNames: ["userId", "keywordHash"],
          isUnique: true,
        }),
      );

      // Create index on userId for fast lookups
      await queryRunner.createIndex(
        "blocked_keywords",
        new TableIndex({
          name: "IDX_blocked_keywords_userId",
          columnNames: ["userId"],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("blocked_keywords", true);
  }
}
