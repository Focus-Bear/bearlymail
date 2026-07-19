import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableColumn,
  TableIndex,
  TableForeignKey,
} from "typeorm";

export class AddPriorityOverrideFields1766208336000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for OverrideReasonType if it doesn't exist
    await queryRunner.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'priority_overrides_reasontype_enum'
        ) THEN
          CREATE TYPE "priority_overrides_reasontype_enum" AS ENUM(
            'wrong_sender_priority', 'wrong_urgency', 'topic_mismatch', 'other'
          );
        END IF;
      END $$;
    `);

    // Add priority override fields to emails table
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      // Add userPriorityOverride column
      const hasUserPriorityOverride = emailsTable.findColumnByName(
        "userPriorityOverride",
      );
      if (!hasUserPriorityOverride) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "userPriorityOverride",
            type: "float",
            isNullable: true,
          }),
        );
      }

      // Add priorityOverrideReason column
      const hasPriorityOverrideReason = emailsTable.findColumnByName(
        "priorityOverrideReason",
      );
      if (!hasPriorityOverrideReason) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "priorityOverrideReason",
            type: "text",
            isNullable: true,
          }),
        );
      }

      // Add priorityOverrideReasonType column
      const hasPriorityOverrideReasonType = emailsTable.findColumnByName(
        "priorityOverrideReasonType",
      );
      if (!hasPriorityOverrideReasonType) {
        await queryRunner.addColumn(
          "emails",
          new TableColumn({
            name: "priorityOverrideReasonType",
            type: "varchar",
            isNullable: true,
          }),
        );
      }
    }

    // Create priority_overrides table
    const hasPriorityOverridesTable =
      await queryRunner.hasTable("priority_overrides");
    if (!hasPriorityOverridesTable) {
      await queryRunner.createTable(
        new Table({
          name: "priority_overrides",
          columns: [
            {
              name: "id",
              type: "uuid",
              isPrimary: true,
              generationStrategy: "uuid",
              default: "uuid_generate_v4()",
            },
            {
              name: "emailId",
              type: "uuid",
              isNullable: false,
            },
            {
              name: "userId",
              type: "uuid",
              isNullable: false,
            },
            {
              name: "originalPriorityScore",
              type: "float",
              isNullable: false,
            },
            {
              name: "userPriorityScore",
              type: "float",
              isNullable: false,
            },
            {
              name: "reasonType",
              type: "priority_overrides_reasontype_enum",
              isNullable: false,
            },
            {
              name: "reasonText",
              type: "text",
              isNullable: true,
            },
            {
              name: "createdAt",
              type: "timestamp",
              default: "CURRENT_TIMESTAMP",
            },
          ],
        }),
        true,
      );

      // Create indexes
      await queryRunner.createIndex(
        "priority_overrides",
        new TableIndex({
          name: "IDX_priority_overrides_userId_emailId",
          columnNames: ["userId", "emailId"],
        }),
      );

      await queryRunner.createIndex(
        "priority_overrides",
        new TableIndex({
          name: "IDX_priority_overrides_emailId",
          columnNames: ["emailId"],
        }),
      );

      await queryRunner.createIndex(
        "priority_overrides",
        new TableIndex({
          name: "IDX_priority_overrides_userId_createdAt",
          columnNames: ["userId", "createdAt"],
        }),
      );

      // Create foreign keys
      await queryRunner.createForeignKey(
        "priority_overrides",
        new TableForeignKey({
          columnNames: ["userId"],
          referencedColumnNames: ["id"],
          referencedTableName: "users",
          onDelete: "CASCADE",
        }),
      );

      await queryRunner.createForeignKey(
        "priority_overrides",
        new TableForeignKey({
          columnNames: ["emailId"],
          referencedColumnNames: ["id"],
          referencedTableName: "emails",
          onDelete: "CASCADE",
        }),
      );

      // Set default value for reasonType enum column
      await queryRunner.query(`
        ALTER TABLE "priority_overrides" 
        ALTER COLUMN "reasonType" 
        SET DEFAULT 'other'::priority_overrides_reasontype_enum
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop priority_overrides table
    const hasPriorityOverridesTable =
      await queryRunner.hasTable("priority_overrides");
    if (hasPriorityOverridesTable) {
      await queryRunner.dropTable("priority_overrides");
    }

    // Drop enum type
    await queryRunner.query(
      `DROP TYPE IF EXISTS "priority_overrides_reasontype_enum"`,
    );

    // Remove columns from emails table
    const emailsTable = await queryRunner.getTable("emails");
    if (emailsTable) {
      const hasPriorityOverrideReasonType = emailsTable.findColumnByName(
        "priorityOverrideReasonType",
      );
      if (hasPriorityOverrideReasonType) {
        await queryRunner.dropColumn("emails", "priorityOverrideReasonType");
      }

      const hasPriorityOverrideReason = emailsTable.findColumnByName(
        "priorityOverrideReason",
      );
      if (hasPriorityOverrideReason) {
        await queryRunner.dropColumn("emails", "priorityOverrideReason");
      }

      const hasUserPriorityOverride = emailsTable.findColumnByName(
        "userPriorityOverride",
      );
      if (hasUserPriorityOverride) {
        await queryRunner.dropColumn("emails", "userPriorityOverride");
      }
    }
  }
}
