import cluster from 'cluster';
import os from 'os';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { WorkerModule } from './worker.module';

const logger = new Logger('Worker');

// Get number of worker processes from env or use CPU cores
// In development, use half the CPU cores to leave resources for other dev tools
const isDev = process.env.NODE_ENV !== 'production';
const cpuCores = os.cpus().length;
const defaultWorkerCount = isDev 
  ? Math.max(1, Math.floor(cpuCores / 2))  // Half cores in dev, minimum 1
  : Math.max(2, cpuCores);  // All cores in production, minimum 2

const WORKER_COUNT = parseInt(process.env.WORKER_PROCESSES || String(defaultWorkerCount), 10);

async function bootstrapWorker(workerId: number) {
  logger.log(`[Worker ${workerId}] Starting worker process...`);
  
  // Create the application context (no HTTP server)
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ['log', 'error', 'warn'],
  });
  
  logger.log(`[Worker ${workerId}] Worker process started successfully`);
  logger.log(`[Worker ${workerId}] Listening for jobs: sync-emails, refine-priority, generate-summary, learn-from-star, scan-history, scan-history-email, analyze-scan-results, analyze-context`);
  
  // Handle graceful shutdown
  process.on('SIGTERM', async () => {
    logger.log(`[Worker ${workerId}] SIGTERM received, shutting down...`);
    await app.close();
    process.exit(0);
  });
  
  process.on('SIGINT', async () => {
    logger.log(`[Worker ${workerId}] SIGINT received, shutting down...`);
    await app.close();
    process.exit(0);
  });
}

// cluster.isPrimary is available in Node 16+, fallback to isMaster for older versions
const isPrimaryProcess = cluster.isPrimary ?? (cluster as any).isMaster;

if (isPrimaryProcess) {
  const mode = isDev ? 'development' : 'production';
  logger.log(`🚀 Master process starting ${WORKER_COUNT} worker processes (CPU cores: ${cpuCores}, mode: ${mode})`);
  
  // Fork workers
  for (let i = 0; i < WORKER_COUNT; i++) {
    cluster.fork({ WORKER_ID: String(i + 1) });
  }
  
  // Handle worker exit - respawn if crashed
  cluster.on('exit', (worker, code, signal) => {
    if (code !== 0 && !worker.exitedAfterDisconnect) {
      logger.error(`Worker ${worker.process.pid} died (code: ${code}, signal: ${signal}). Restarting...`);
      cluster.fork({ WORKER_ID: String(worker.id) });
    }
  });
  
  // Graceful shutdown of all workers
  process.on('SIGTERM', () => {
    logger.log('Master received SIGTERM, shutting down all workers...');
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill('SIGTERM');
    }
  });
  
  process.on('SIGINT', () => {
    logger.log('Master received SIGINT, shutting down all workers...');
    for (const id in cluster.workers) {
      cluster.workers[id]?.kill('SIGINT');
    }
  });
} else {
  // Worker process
  const workerId = parseInt(process.env.WORKER_ID || '1', 10);
  bootstrapWorker(workerId).catch((err) => {
    logger.error(`[Worker ${workerId}] Failed to start:`, err);
    process.exit(1);
  });
}
