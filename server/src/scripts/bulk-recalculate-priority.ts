/**
 * Script to bulk recalculate priority for threads that don't have priority explanations
 *
 * Usage:
 *   npm run ts-node -r tsconfig-paths/register src/scripts/bulk-recalculate-priority.ts <userId> [--limit N]
 *
 * Example:
 *   npm run ts-node -r tsconfig-paths/register src/scripts/bulk-recalculate-priority.ts user-123 --limit 100
 */

import { config } from "dotenv";
import * as path from "path";
import { DataSource } from "typeorm";

import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { getJobPriority } from "../queue/job-priorities";
import { esmImport } from "../utils/esm-import.util";

config({ path: path.join(__dirname, "../../.env") });

async function bulkRecalculatePriority(userId?: string, limit: number = 100) {
  // Create database connection
  const dataSource = new DataSource({
    type: "postgres",
    host: process.env.DB_HOST || "localhost",
    port: parseInt(process.env.DB_PORT || "5432", 10),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    // nosemgrep
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
    entities: [EmailThread, Email],
  });

  await dataSource.initialize();
  console.log("Database connected");

  // Initialize pg-boss
  const { PgBoss: PgBossCtor } =
    await esmImport<typeof import("pg-boss")>("pg-boss");
  const boss = new PgBossCtor({
    connectionString: `postgres://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
    // nosemgrep
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  });

  await boss.start();
  console.log("PgBoss started");

  try {
    const emailThreadRepository = dataSource.getRepository(EmailThread);
    const emailRepository = dataSource.getRepository(Email);

    // Build query to find threads needing recalculation
    const queryBuilder = emailThreadRepository
      .createQueryBuilder("thread")
      .where("thread.priorityExplanation IS NULL")
      .orWhere(
        "(thread.isProcessingPriority = true AND thread.updatedAt < NOW() - INTERVAL '10 minutes')",
      );

    if (userId) {
      queryBuilder.andWhere("thread.userId = :userId", { userId });
    }

    queryBuilder.limit(limit);

    const threads = await queryBuilder.getMany();

    console.log(
      `Found ${threads.length} threads needing priority recalculation`,
    );

    let queued = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const thread of threads) {
      try {
        // Reset processing flag if stuck
        if (thread.isProcessingPriority) {
          await emailThreadRepository.update(
            { id: thread.id },
            { isProcessingPriority: false },
          );
        }

        // Get an email from this thread to use for the job
        const email = await emailRepository.findOne({
          where: { emailThreadId: thread.id },
          select: {
            id: true,
            userId: true,
          },
        });

        if (!email) {
          console.log(`Skipping thread ${thread.id} - no emails found`);
          skipped++;
          continue;
        }

        // Queue the job
        await boss.send(
          JOB_NAMES.REFINE_PRIORITY,
          { userId: email.userId, emailId: email.id },
          {
            priority: getJobPriority(
              JOB_NAMES.REFINE_PRIORITY_BACKGROUND,
              false,
            ),
            singletonKey: `refine-priority-${email.id}`,
            singletonSeconds: SECONDS.FIVE_MINUTES,
          },
        );

        queued++;
        if (queued % 10 === 0) {
          console.log(`Queued ${queued} jobs...`);
        }
      } catch (error) {
        const errorMsg = `Failed to queue job for thread ${thread.id}: ${error instanceof Error ? error.message : "Unknown error"}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log("\n=== Summary ===");
    console.log(`Total threads found: ${threads.length}`);
    console.log(`Jobs queued: ${queued}`);
    console.log(`Skipped (no emails): ${skipped}`);
    console.log(`Errors: ${errors.length}`);
    if (errors.length > 0) {
      console.log("\nErrors:");
      errors.forEach((err) => console.log(`  - ${err}`));
    }

    await boss.stop();
    await dataSource.destroy();
  } catch (error) {
    console.error("Error:", error);
    await boss.stop();
    await dataSource.destroy();
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const userIdArg = args.find((arg) => !arg.startsWith("--"));
const limitArg = args.find((arg) => arg.startsWith("--limit"));
const limit = limitArg ? parseInt(limitArg.split("=")[1] || "100", 10) : 100;

if (!userIdArg) {
  console.error(
    "Usage: npm run ts-node -r tsconfig-paths/register src/scripts/bulk-recalculate-priority.ts <userId> [--limit N]",
  );
  console.error(
    "Example: npm run ts-node -r tsconfig-paths/register src/scripts/bulk-recalculate-priority.ts user-123 --limit 100",
  );
  process.exit(1);
}

bulkRecalculatePriority(userIdArg, limit)
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
