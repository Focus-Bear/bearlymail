import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import cluster from "cluster";
import os from "os";

import { NODE_ENV_VALUES } from "./constants/domain-types";
import { encryptionKeyProvider } from "./encryption/encryption-key-provider";
import { initializeGlobalErrorTracking } from "./error-tracking/error-tracking-setup";
import { logErrorToFile, setupGlobalErrorHandlers } from "./utils/error-logger";
import { WorkerModule } from "./worker.module";

const logger = new Logger("Worker");

// Initialize PostHog for global error tracking in workers
initializeGlobalErrorTracking();

// Get number of worker processes from env or use CPU cores
// In development, use half the CPU cores to leave resources for other dev tools
const isDev = process.env.NODE_ENV !== NODE_ENV_VALUES.PRODUCTION;
const cpuCores = os.cpus().length;
// Half cores in dev, minimum 1
// All cores in production, minimum 2
const defaultWorkerCount = isDev
  ? Math.max(1, Math.floor(cpuCores / 2))
  : Math.max(2, cpuCores);

const WORKER_COUNT = parseInt(
  process.env.WORKER_PROCESSES || String(defaultWorkerCount),
  10,
);

async function bootstrapWorker(workerId: number) {
  logger.log(`[Worker ${workerId}] Starting worker process...`);

  // Must be called before NestJS bootstraps so TypeORM column transformers
  // (which call encryptionKeyProvider.getKey()) have the global key ready.
  // Prefers the KMS-wrapped global key (SAQ Q47); falls back to ENCRYPTION_KEY.
  await encryptionKeyProvider.initializeFromManagedKey();

  // Create the application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["log", "error", "warn"],
  });

  logger.log(`[Worker ${workerId}] Worker process started successfully`);
  logger.log(
    `[Worker ${workerId}] Listening for jobs: schedule-email-fetch-jobs, fetch-user-emails, fetch-user-emails-extended, refine-priority, refine-priority-batch, generate-summary, learn-from-star, scan-history, scan-history-email, analyze-scan-results, analyze-context, analyze-context-batch, finalize-context-analysis, check-writing-style-learning, auto-responder, archive-email, archive-email-provider-sync, generate-follow-up-draft, bulk-send-follow-ups, audit-log-archive`,
  );

  // Handle graceful shutdown
  process.on("SIGTERM", async () => {
    logger.log(`[Worker ${workerId}] SIGTERM received, shutting down...`);
    await app.close();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.log(`[Worker ${workerId}] SIGINT received, shutting down...`);
    await app.close();
    process.exit(0);
  });
}

// cluster.isPrimary is available in Node 16+, fallback to isMaster for older versions
const isPrimaryProcess =
  cluster.isPrimary ?? (cluster as { isMaster?: boolean }).isMaster;

if (isPrimaryProcess) {
  const mode = isDev ? "development" : "production";
  logger.log(
    `🚀 Master process starting ${WORKER_COUNT} worker processes (CPU cores: ${cpuCores}, mode: ${mode})`,
  );

  // Fork workers
  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork({ WORKER_ID: String(i + 1) });
  }

  // Handle worker exit - respawn if crashed
  cluster.on("exit", (worker, code, signal) => {
    if (code !== 0 && !worker.exitedAfterDisconnect) {
      logger.error(
        `Worker ${worker.process.pid} died (code: ${code}, signal: ${signal}). Restarting...`,
      );
      cluster.fork({ WORKER_ID: String(worker.id) });
    }
  });

  // Graceful shutdown of all workers
  process.on("SIGTERM", () => {
    logger.log("Master received SIGTERM, shutting down all workers...");
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill("SIGTERM");
    }
  });

  process.on("SIGINT", () => {
    logger.log("Master received SIGINT, shutting down all workers...");
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill("SIGINT");
    }
  });
} else {
  // Worker process
  const workerId = parseInt(process.env.WORKER_ID || "1", 10);
  // Set up error handlers for this worker process
  setupGlobalErrorHandlers(`Worker-${workerId}`);

  bootstrapWorker(workerId).catch((err) => {
    logger.error(`[Worker ${workerId}] Failed to start:`, err);
    logErrorToFile(
      `Worker ${workerId} failed to start`,
      err,
      `Worker-${workerId}`,
    );
    process.exit(1);
  });
}
