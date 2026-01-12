import { MigrationInterface, QueryRunner, TableIndex } from "typeorm";
import { isError } from "../../../types/common";

export class AddEmailPerformanceIndexes1735272000000
  implements MigrationInterface
{
  name = "AddEmailPerformanceIndexes1735272000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Note: starCount and isArchived have been moved to email_threads table
    // These indexes only include columns that exist on the emails table

    // Composite index for inbox filtering by userId, isSnoozed
    try {
      await queryRunner.createIndex(
        "emails",
        new TableIndex({
          name: "IDX_emails_userId_isSnoozed",
          columnNames: ["userId", "isSnoozed"],
        }),
      );
    } catch (error: unknown) {
      // Index might already exist, skip if so
      const errorMessage = isError(error) ? error.message : undefined;
      if (!errorMessage?.includes("already exists")) {
        throw error;
      }
    }

    // Composite index for triage/process filtering by userId, isSnoozed, isBatched
    try {
      await queryRunner.createIndex(
        "emails",
        new TableIndex({
          name: "IDX_emails_userId_isSnoozed_isBatched",
          columnNames: ["userId", "isSnoozed", "isBatched"],
        }),
      );
    } catch (error: unknown) {
      // Index might already exist, skip if so
      const errorMessage = isError(error) ? error.message : undefined;
      if (!errorMessage?.includes("already exists")) {
        throw error;
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes in reverse order
    try {
      await queryRunner.dropIndex(
        "emails",
        "IDX_emails_userId_isSnoozed_isBatched",
      );
    } catch (error: unknown) {
      // Index might not exist, ignore
    }

    try {
      await queryRunner.dropIndex("emails", "IDX_emails_userId_isSnoozed");
    } catch (error: unknown) {
      // Index might not exist, ignore
    }
  }
}
