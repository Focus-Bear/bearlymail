import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectConnection } from "@nestjs/typeorm";
import { Connection } from "typeorm";

@Injectable()
export class DatabaseCleanupService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseCleanupService.name);

  constructor(@InjectConnection() private connection: Connection) {}

  async onApplicationBootstrap() {
    try {
      this.logger.log("Cleaning up NULL userId values after UUID migration...");

      // Clean up invalid rows with NULL userId
      const tables = [
        "user_contexts",
        "private_notes",
        "emails",
        "summarization_rules",
      ];

      let totalDeleted = 0;
      for (const table of tables) {
        try {
          // Check if table exists before trying to clean it
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
            continue;
          }

          // Use parameterized query to prevent SQL injection
          const result = await this.connection.query(
            `DELETE FROM "${table}" WHERE "userId" IS NULL`,
          );
          // Result format: [result array, rowCount]
          const deleted =
            Array.isArray(result) &&
            result.length > 0 &&
            typeof result[0] === "number"
              ? result[0]
              : result.rowCount || result[1] || 0;
          if (deleted > 0) {
            this.logger.warn(`Deleted ${deleted} invalid rows from ${table}`);
            totalDeleted += deleted;
          }
        } catch (err: any) {
          // Table might not exist yet or other error - silently skip
          if (
            err.message?.includes("does not exist") ||
            (err.message?.includes("relation") &&
              err.message?.includes("does not exist"))
          ) {
            // Table doesn't exist yet - this is expected if migration hasn't run
            // Don't log as error, just skip silently
            continue;
          } else {
            // Only log actual errors, not missing table errors
            this.logger.debug(`Error cleaning ${table}: ${err.message}`);
          }
        }
      }

      if (totalDeleted > 0) {
        this.logger.warn(`Total: Deleted ${totalDeleted} invalid rows`);
      }

      // Now try to make userId non-nullable (will fail silently if constraint already exists or column is already NOT NULL)
      try {
        const result = await this.connection.query(`
          ALTER TABLE user_contexts 
          ALTER COLUMN "userId" SET NOT NULL;
        `);
        this.logger.log("Set userId as NOT NULL in user_contexts");
      } catch (err: any) {
        // Ignore if already NOT NULL or constraint issues
        if (
          !err.message?.includes("already") &&
          !err.message?.includes("constraint")
        ) {
          this.logger.debug(
            `Could not set NOT NULL constraint (this is okay): ${err.message}`,
          );
        }
      }

      this.logger.log("Cleanup completed");
    } catch (error: any) {
      // If tables don't exist yet (first run), that's okay
      if (error.message?.includes("does not exist")) {
        this.logger.log("Tables do not exist yet, skipping cleanup");
      } else {
        this.logger.error("Error during cleanup:", error);
      }
    }
  }
}
