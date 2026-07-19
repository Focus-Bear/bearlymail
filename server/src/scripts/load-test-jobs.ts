/**
 * Load Testing Script for Job Queue
 *
 * This script simulates various load scenarios to test job processing performance:
 * - Concurrent email syncs (multiple users)
 * - Burst of priority refinement jobs
 * - Mixed workload scenarios
 *
 * Usage:
 *   ts-node -r tsconfig-paths/register src/scripts/load-test-jobs.ts [scenario]
 *
 * Scenarios:
 *   - sync: Test concurrent email syncs (10 users)
 *   - priority: Test burst of priority refinement jobs (50 emails)
 *   - mixed: Test mixed workload (syncs + LLM jobs + learning)
 *   - all: Run all scenarios
 */

import * as dotenv from "dotenv";
import * as path from "path";
import type { PgBoss } from "pg-boss";

import { JOB_NAMES } from "../constants/job-names";
import { MS_PER_SECOND } from "../constants/time-constants";
import { esmImport } from "../utils/esm-import.util";

// Load environment variables
dotenv.config({ path: path.join(__dirname, "../../.env") });

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_PORT = parseInt(process.env.DB_PORT || "5432", 10);
const DB_USERNAME = process.env.DB_USERNAME || "postgres";
const DB_PASSWORD = process.env.DB_PASSWORD || "postgres";
const DB_NAME = process.env.DB_NAME || "adhd_email_client";
const DB_SSL = process.env.DB_SSL === "true";

const isLocal = DB_HOST === "localhost" || DB_HOST === "127.0.0.1";
// nosemgrep
const useSsl = !isLocal || DB_SSL ? { rejectUnauthorized: false } : false;

// Load test configuration constants
const LOAD_TEST_CONFIG = {
  // Number of priority refinement jobs to queue
  PRIORITY_JOBS_COUNT: 20,
  // Number of summary generation jobs to queue
  SUMMARY_JOBS_COUNT: 10,
  // Offset for summary job email IDs
  SUMMARY_EMAIL_OFFSET: 20,
  // Number of learning jobs to queue
  LEARNING_JOBS_COUNT: 10,
  // Offset for learning job email IDs
  LEARNING_EMAIL_OFFSET: 30,
  // Number of context analysis jobs to queue
  CONTEXT_ANALYSIS_JOBS_COUNT: 3,
  // Wait time for jobs to start processing (ms)
  JOB_PROCESSING_WAIT_MS: 10000,
} as const;

// Test user IDs (you'll need to replace these with actual test user IDs)
const TEST_USER_IDS = [
  "test-user-1",
  "test-user-2",
  "test-user-3",
  "test-user-4",
  "test-user-5",
  "test-user-6",
  "test-user-7",
  "test-user-8",
  "test-user-9",
  "test-user-10",
];

// Test email IDs (you'll need to replace these with actual test email IDs)
const TEST_EMAIL_IDS = Array.from(
  { length: 50 },
  (_, i) => `test-email-${i + 1}`,
);

interface LoadTestResult {
  scenario: string;
  jobsQueued: number;
  startTime: number;
  endTime?: number;
  duration?: number;
  errors: string[];
}

async function createBoss(): Promise<PgBoss> {
  const { PgBoss: PgBossCtor } =
    await esmImport<typeof import("pg-boss")>("pg-boss");
  const boss = new PgBossCtor({
    connectionString: `postgres://${DB_USERNAME}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`,
    ssl: useSsl,
  });

  await boss.start();
  return boss;
}

async function testConcurrentSyncs(boss: PgBoss): Promise<LoadTestResult> {
  console.log("\n=== Testing Concurrent Email Syncs ===");
  const result: LoadTestResult = {
    scenario: "concurrent-syncs",
    jobsQueued: 0,
    startTime: Date.now(),
    errors: [],
  };

  try {
    const promises = TEST_USER_IDS.map(async (userId) => {
      try {
        await boss.send(
          JOB_NAMES.SYNC_EMAILS,
          { userId },
          {
            priority: 80,
            // High priority
            singletonKey: `sync-emails-${userId}`,
          },
        );
        result.jobsQueued++;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        result.errors.push(
          `Failed to queue sync for ${userId}: ${errorMessage}`,
        );
      }
    });

    await Promise.all(promises);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Test failed: ${errorMessage}`);
  }

  result.endTime = Date.now();
  result.duration = result.endTime - result.startTime;

  console.log(`Queued ${result.jobsQueued} sync jobs in ${result.duration}ms`);
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.length}`);
    result.errors.forEach((err) => {
      console.error(`  - ${err}`);
    });
  }

  return result;
}

async function testPriorityBurst(boss: PgBoss): Promise<LoadTestResult> {
  console.log("\n=== Testing Priority Refinement Burst ===");
  const result: LoadTestResult = {
    scenario: "priority-burst",
    jobsQueued: 0,
    startTime: Date.now(),
    errors: [],
  };

  const userId = TEST_USER_IDS[0];

  try {
    const promises = TEST_EMAIL_IDS.map(async (emailId) => {
      try {
        await boss.send(
          JOB_NAMES.REFINE_PRIORITY,
          { userId, emailId },
          {
            priority: 80,
            // High priority
            singletonKey: `refine-priority-${emailId}`,
          },
        );
        result.jobsQueued++;
      } catch (error: unknown) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown error";
        result.errors.push(
          `Failed to queue priority job for ${emailId}: ${errorMessage}`,
        );
      }
    });

    await Promise.all(promises);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Test failed: ${errorMessage}`);
  }

  result.endTime = Date.now();
  result.duration = result.endTime - result.startTime;

  console.log(
    `Queued ${result.jobsQueued} priority refinement jobs in ${result.duration}ms`,
  );
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.length}`);
    result.errors.forEach((err) => {
      console.error(`  - ${err}`);
    });
  }

  return result;
}

async function testMixedWorkload(boss: PgBoss): Promise<LoadTestResult> {
  console.log("\n=== Testing Mixed Workload ===");
  const result: LoadTestResult = {
    scenario: "mixed-workload",
    jobsQueued: 0,
    startTime: Date.now(),
    errors: [],
  };

  try {
    const jobs: Promise<void>[] = [];

    // Queue syncs for 5 users
    for (let i = 0; i < 5; i++) {
      const userId = TEST_USER_IDS[i];
      jobs.push(
        boss
          .send(
            JOB_NAMES.SYNC_EMAILS,
            { userId },
            {
              priority: 80,
              singletonKey: `sync-emails-${userId}`,
            },
          )
          .then(() => {
            result.jobsQueued++;
          })
          .catch((err: unknown) => {
            const errorMessage =
              err instanceof Error ? err.message : "Unknown error";
            result.errors.push(`Sync for ${userId}: ${errorMessage}`);
          }),
      );
    }

    // Queue priority refinement for PRIORITY_JOBS_COUNT emails
    for (let i = 0; i < LOAD_TEST_CONFIG.PRIORITY_JOBS_COUNT; i++) {
      const emailId = TEST_EMAIL_IDS[i];
      jobs.push(
        boss
          .send(
            JOB_NAMES.REFINE_PRIORITY,
            { userId: TEST_USER_IDS[0], emailId },
            {
              priority: 80,
              singletonKey: `refine-priority-${emailId}`,
            },
          )
          .then(() => {
            result.jobsQueued++;
          })
          .catch((err: unknown) => {
            const errorMessage =
              err instanceof Error ? err.message : "Unknown error";
            result.errors.push(`Priority for ${emailId}: ${errorMessage}`);
          }),
      );
    }

    // Queue summary generation for SUMMARY_JOBS_COUNT emails
    for (let i = 0; i < LOAD_TEST_CONFIG.SUMMARY_JOBS_COUNT; i++) {
      const emailId = TEST_EMAIL_IDS[i + LOAD_TEST_CONFIG.SUMMARY_EMAIL_OFFSET];
      jobs.push(
        boss
          .send(
            JOB_NAMES.GENERATE_SUMMARY,
            { userId: TEST_USER_IDS[0], emailId },
            {
              priority: 80,
              singletonKey: `generate-summary-${emailId}`,
            },
          )
          .then(() => {
            result.jobsQueued++;
          })
          .catch((err: unknown) => {
            const errorMessage =
              err instanceof Error ? err.message : "Unknown error";
            result.errors.push(`Summary for ${emailId}: ${errorMessage}`);
          }),
      );
    }

    // Queue learning jobs
    for (let i = 0; i < LOAD_TEST_CONFIG.LEARNING_JOBS_COUNT; i++) {
      const emailId =
        TEST_EMAIL_IDS[i + LOAD_TEST_CONFIG.LEARNING_EMAIL_OFFSET];
      jobs.push(
        boss
          .send(
            JOB_NAMES.LEARN_FROM_STAR,
            { userId: TEST_USER_IDS[0], emailId, starCount: 3 },
            {
              priority: 10,
              // Low priority
            },
          )
          .then(() => {
            result.jobsQueued++;
          })
          .catch((err: unknown) => {
            const errorMessage =
              err instanceof Error ? err.message : "Unknown error";
            result.errors.push(`Learn for ${emailId}: ${errorMessage}`);
          }),
      );
    }

    await Promise.all(jobs);
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    result.errors.push(`Test failed: ${errorMessage}`);
  }

  result.endTime = Date.now();
  result.duration = result.endTime - result.startTime;

  console.log(
    `Queued ${result.jobsQueued} mixed workload jobs in ${result.duration}ms`,
  );
  if (result.errors.length > 0) {
    console.log(`Errors: ${result.errors.length}`);
    result.errors.forEach((err) => {
      console.error(`  - ${err}`);
    });
  }

  return result;
}

async function getQueueStats(boss: PgBoss): Promise<void> {
  console.log("\n=== Current Queue Statistics ===");

  const queueNames = [
    JOB_NAMES.SYNC_EMAILS,
    JOB_NAMES.REFINE_PRIORITY,
    JOB_NAMES.GENERATE_SUMMARY,
    JOB_NAMES.LEARN_FROM_STAR,
    JOB_NAMES.ANALYZE_SCAN_RESULTS,
    JOB_NAMES.ANALYZE_CONTEXT,
  ];

  for (const queueName of queueNames) {
    try {
      // getJobCounts exists at runtime but not in TypeScript types
      const counts = await (
        boss as {
          getJobCounts?: (queueName: string) => Promise<{
            pending?: number;
            active?: number;
            completed?: number;
            failed?: number;
          }>;
        }
      ).getJobCounts?.(queueName);

      console.log(`${queueName}:`);

      console.log(`  Pending: ${counts?.pending || 0}`);

      console.log(`  Active: ${counts?.active || 0}`);

      console.log(`  Completed: ${counts?.completed || 0}`);

      console.log(`  Failed: ${counts?.failed || 0}`);
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // nosemgrep
      console.error(`Failed to get stats for ${queueName}:`, errorMessage);
    }
  }
}

async function main() {
  const scenario = process.argv[2] || "all";
  const boss = await createBoss();

  try {
    console.log("Starting load tests...");

    console.log(`Scenario: ${scenario}`);

    // Get initial queue stats
    await getQueueStats(boss);

    const results: LoadTestResult[] = [];

    if (scenario === "sync" || scenario === "all") {
      results.push(await testConcurrentSyncs(boss));
    }

    if (scenario === "priority" || scenario === "all") {
      results.push(await testPriorityBurst(boss));
    }

    if (scenario === "mixed" || scenario === "all") {
      results.push(await testMixedWorkload(boss));
    }

    // Wait a bit for jobs to process

    console.log(
      `\nWaiting ${LOAD_TEST_CONFIG.JOB_PROCESSING_WAIT_MS / MS_PER_SECOND} seconds for jobs to start processing...`,
    );
    await new Promise((resolve) =>
      setTimeout(resolve, LOAD_TEST_CONFIG.JOB_PROCESSING_WAIT_MS),
    );

    // Get final queue stats
    await getQueueStats(boss);

    // Print summary

    console.log("\n=== Test Summary ===");
    results.forEach((result) => {
      console.log(`\n${result.scenario}:`);

      console.log(`  Jobs queued: ${result.jobsQueued}`);

      console.log(`  Duration: ${result.duration}ms`);

      console.log(`  Errors: ${result.errors.length}`);
    });

    console.log("\n✅ Load tests completed!");

    console.log(
      "\nNote: Check queue-metrics.log and resource-metrics.log for detailed metrics.",
    );
  } catch (error) {
    console.error("Load test failed:", error);
    process.exit(1);
  } finally {
    await boss.stop();
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { testConcurrentSyncs, testMixedWorkload, testPriorityBurst };
