import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

import { getErrorMessage, isError } from "../types/common";

@Injectable()
export class DatabaseCleanupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseCleanupService.name);

  constructor(@InjectDataSource() private connection: DataSource) {}

  async onApplicationBootstrap() {
    try {
      this.logger.log("Cleaning up NULL userId values after UUID migration...");

      const tables = [
        "user_contexts",
        "private_notes",
        "emails",
        "summarization_rules",
      ];

      const totalDeleted = await this.cleanupNullUserIds(tables);

      if (totalDeleted > 0) {
        this.logger.warn(`Total: Deleted ${totalDeleted} invalid rows`);
      }

      await this.enforceUserIdNotNull();

      this.logger.log("Cleanup completed");
    } catch (error: unknown) {
      const errorMessage = isError(error) ? error.message : undefined;
      if (errorMessage?.includes("does not exist")) {
        this.logger.log("Tables do not exist yet, skipping cleanup");
      } else {
        this.logger.error("Error during cleanup:", error);
      }
    }
  }

  private async cleanupNullUserIds(tables: string[]): Promise<number> {
    let totalDeleted = 0;
    for (const table of tables) {
      const deleted = await this.cleanTableNullUserIds(table);
      totalDeleted += deleted;
    }
    return totalDeleted;
  }

  private async cleanTableNullUserIds(table: string): Promise<number> {
    try {
      const tableExists = await this.connection.query(
        `SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_schema = 'public'
          AND table_name = $1
        )`,
        [table],
      );

      if (!tableExists || !tableExists[0] || !tableExists[0].exists) {
        this.logger.debug(
          `Table ${table} does not exist yet, skipping cleanup`,
        );
        return 0;
      }

      const result = await this.connection.query(
        `DELETE FROM "${table}" WHERE "userId" IS NULL`,
      );
      const deleted =
        Array.isArray(result) &&
        result.length > 0 &&
        typeof result[0] === "number"
          ? result[0]
          : result.rowCount || result[1] || 0;

      if (deleted > 0) {
        this.logger.warn(`Deleted ${deleted} invalid rows from ${table}`);
      }
      return deleted;
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      if (
        errorMessage?.includes("does not exist") ||
        (errorMessage?.includes("relation") &&
          errorMessage?.includes("does not exist"))
      ) {
        return 0;
      }
      this.logger.debug(`Error cleaning ${table}: ${errorMessage}`);
      return 0;
    }
  }

  private async enforceUserIdNotNull(): Promise<void> {
    try {
      await this.connection.query(`
        ALTER TABLE user_contexts
        ALTER COLUMN "userId" SET NOT NULL;
      `);
      this.logger.log("Set userId as NOT NULL in user_contexts");
    } catch (err: unknown) {
      const errorMessage = getErrorMessage(err);
      if (
        !errorMessage?.includes("already") &&
        !errorMessage?.includes("constraint")
      ) {
        this.logger.debug(
          `Could not set NOT NULL constraint (this is okay): ${errorMessage}`,
        );
      }
    }
  }
}
