import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableForeignKey,
  TableIndex,
} from "typeorm";

export class CreateEmailThreadsTable1735400000000
  implements MigrationInterface
{
  name = "CreateEmailThreadsTable1735400000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists (created by InitialSchema)
    const tableExists = await queryRunner.hasTable("email_threads");

    if (!tableExists) {
      // Create email_threads table
      await queryRunner.createTable(
        new Table({
          name: "email_threads",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            {
              name: "userId",
              type: "uuid",
              isNullable: false,
            },
            {
              name: "threadId",
              type: "varchar",
              isNullable: false,
            },
            {
              name: "starCount",
              type: "int",
              default: 0,
            },
            {
              name: "isArchived",
              type: "boolean",
              default: false,
            },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
            {
              name: "updatedAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
        }),
        true,
      );
    }

    // Create unique index on userId + threadId (if it doesn't exist)
    const emailThreadsTable = await queryRunner.getTable("email_threads");
    const hasUniqueIndex = emailThreadsTable?.indices.find(
      (i) => i.name === "IDX_email_threads_userId_threadId",
    );
    if (!hasUniqueIndex) {
      await queryRunner.createIndex(
        "email_threads",
        new TableIndex({
          name: "IDX_email_threads_userId_threadId",
          columnNames: ["userId", "threadId"],
          isUnique: true,
        }),
      );
    }

    // Create indexes for filtering (if they don't exist)
    const hasFilterIndex1 = emailThreadsTable?.indices.find(
      (i) => i.name === "IDX_email_threads_userId_starCount_isArchived",
    );
    if (!hasFilterIndex1) {
      await queryRunner.createIndex(
        "email_threads",
        new TableIndex({
          name: "IDX_email_threads_userId_starCount_isArchived",
          columnNames: ["userId", "starCount", "isArchived"],
        }),
      );
    }

    const hasFilterIndex2 = emailThreadsTable?.indices.find(
      (i) => i.name === "IDX_email_threads_userId_isArchived_starCount",
    );
    if (!hasFilterIndex2) {
      await queryRunner.createIndex(
        "email_threads",
        new TableIndex({
          name: "IDX_email_threads_userId_isArchived_starCount",
          columnNames: ["userId", "isArchived", "starCount"],
        }),
      );
    }

    // Add emailThreadId column to emails table (if it doesn't exist)
    const emailsTable = await queryRunner.getTable("emails");
    const hasEmailThreadId = emailsTable?.findColumnByName("emailThreadId");
    if (!hasEmailThreadId) {
      await queryRunner.addColumn(
        "emails",
        new TableColumn({
          name: "emailThreadId",
          type: "uuid",
          isNullable: true,
        }),
      );
    }

    // Migrate existing data: Create email_threads records from existing emails
    // Only if there are emails without emailThreadId and email_threads is empty
    const emailThreadsCount = await queryRunner.query(
      `SELECT COUNT(*) as count FROM email_threads`,
    );
    const emailsWithoutThreadId = await queryRunner.query(
      `SELECT COUNT(*) as count FROM emails WHERE "emailThreadId" IS NULL`,
    );

    if (
      emailThreadsCount[0]?.count === "0" &&
      emailsWithoutThreadId[0]?.count > 0
    ) {
      // Group by userId + threadId, take max starCount and any isArchived = true
      await queryRunner.query(`
      INSERT INTO email_threads ("id", "userId", "threadId", "starCount", "isArchived", "createdAt", "updatedAt")
      SELECT 
        uuid_generate_v4() as id,
        "userId",
        "threadId",
        MAX("starCount") as "starCount",
        BOOL_OR("isArchived") as "isArchived",
        MIN("receivedAt") as "createdAt",
        NOW() as "updatedAt"
      FROM emails
      GROUP BY "userId", "threadId"
    `);

      // Update emails table to link to email_threads
      await queryRunner.query(`
      UPDATE emails e
      SET "emailThreadId" = et.id
      FROM email_threads et
      WHERE e."userId" = et."userId" 
        AND e."threadId" = et."threadId"
      `);
    }

    // Create foreign key (if it doesn't exist)
    const hasForeignKey = emailsTable?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf("emailThreadId") !== -1,
    );
    if (!hasForeignKey) {
      await queryRunner.createForeignKey(
        "emails",
        new TableForeignKey({
          columnNames: ["emailThreadId"],
          referencedColumnNames: ["id"],
          referencedTableName: "email_threads",
          onDelete: "CASCADE",
        }),
      );
    }

    // Create index on emailThreadId for joins (if it doesn't exist)
    const hasEmailThreadIdIndex = emailsTable?.indices.find(
      (i) => i.name === "IDX_emails_emailThreadId",
    );
    if (!hasEmailThreadIdIndex) {
      await queryRunner.createIndex(
        "emails",
        new TableIndex({
          name: "IDX_emails_emailThreadId",
          columnNames: ["emailThreadId"],
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove foreign key
    const table = await queryRunner.getTable("emails");
    const foreignKey = table?.foreignKeys.find(
      (fk) => fk.columnNames.indexOf("emailThreadId") !== -1,
    );
    if (foreignKey) {
      await queryRunner.dropForeignKey("emails", foreignKey);
    }

    // Remove index
    await queryRunner.dropIndex("emails", "IDX_emails_emailThreadId");

    // Remove emailThreadId column
    await queryRunner.dropColumn("emails", "emailThreadId");

    // Drop email_threads table
    await queryRunner.dropTable("email_threads");
  }
}
