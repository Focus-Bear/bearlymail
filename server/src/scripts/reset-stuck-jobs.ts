/**
 * Script to reset stuck pg-boss jobs
 * Run with: npx ts-node -r tsconfig-paths/register src/scripts/reset-stuck-jobs.ts
 */

import * as dotenv from "dotenv";
import { Client } from "pg";

dotenv.config();

// Script configuration constants
const SCRIPT_CONFIG = {
  // Maximum number of reset jobs to display
  MAX_DISPLAY_ITEMS: 10,
} as const;

async function resetStuckJobs() {
  const dbHost = process.env.DB_HOST;
  const isLocal = dbHost === "localhost" || dbHost === "127.0.0.1";
  const sslEnabled = process.env.DB_SSL === "true";
  // Use SSL for non-local connections unless explicitly disabled
  // nosemgrep
  const useSsl = !isLocal || sslEnabled ? { rejectUnauthorized: false } : false;

  const client = new Client({
    host: dbHost,
    port: parseInt(process.env.DB_PORT || "5432"),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: useSsl,
  });

  console.log(
    `Connecting to ${dbHost}:${process.env.DB_PORT} (SSL: ${useSsl ? "enabled" : "disabled"})`,
  );

  try {
    await client.connect();

    console.log("Connected to database");

    // Check current state of jobs
    const beforeResult = await client.query(`
      SELECT name, state, COUNT(*) as count, 
             MIN(startafter) as earliest_start,
             MAX(startafter) as latest_start
      FROM pgboss.job 
      WHERE state != 'completed' AND state != 'cancelled'
      GROUP BY name, state
      ORDER BY name, state
    `);

    console.log("\nCurrent job states:");

    console.table(beforeResult.rows);

    // Reset jobs that are stuck in retry state with future startafter times
    const resetResult = await client.query(`
      UPDATE pgboss.job 
      SET startafter = NOW(), 
          retrycount = 0,
          retrydelay = 10,
          retrybackoff = false
      WHERE state IN ('retry', 'created')
      AND startafter > NOW()
      AND name IN ('refine-priority', 'generate-summary', 'sync-emails', 'learn-from-star', 'scan-history', 'scan-history-email', 'analyze-scan-results')
      RETURNING id, name, state
    `);

    console.log(`\nReset ${resetResult.rowCount} stuck jobs`);

    if (resetResult.rowCount && resetResult.rowCount > 0) {
      console.log("Reset jobs:");
      resetResult.rows
        .slice(0, SCRIPT_CONFIG.MAX_DISPLAY_ITEMS)
        .forEach((row) => {
          console.log(`  - ${row.name} (${row.id})`);
        });
      if (resetResult.rowCount > SCRIPT_CONFIG.MAX_DISPLAY_ITEMS) {
        console.log(
          `  ... and ${resetResult.rowCount - SCRIPT_CONFIG.MAX_DISPLAY_ITEMS} more`,
        );
      }
    }

    // Also fix any jobs with aggressive backoff settings
    const fixBackoffResult = await client.query(`
      UPDATE pgboss.job 
      SET retrydelay = 10,
          retrybackoff = false
      WHERE state IN ('retry', 'created', 'active')
      AND (retrydelay > 60 OR retrybackoff = true)
      AND name IN ('refine-priority', 'generate-summary', 'sync-emails', 'learn-from-star', 'scan-history', 'scan-history-email', 'analyze-scan-results')
    `);

    console.log(
      `\nFixed backoff settings for ${fixBackoffResult.rowCount} jobs`,
    );

    // Show final state
    const afterResult = await client.query(`
      SELECT name, state, COUNT(*) as count
      FROM pgboss.job 
      WHERE state != 'completed' AND state != 'cancelled'
      GROUP BY name, state
      ORDER BY name, state
    `);

    console.log("\nFinal job states:");

    console.table(afterResult.rows);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await client.end();

    console.log("\nDisconnected from database");
  }
}

resetStuckJobs();
