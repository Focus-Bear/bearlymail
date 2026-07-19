import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import type { PgBoss } from "pg-boss";
import { DataSource } from "typeorm";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { QUERY_LIMITS } from "../constants/query-limits";
import { QUEUE_CONSTANTS } from "../constants/queue-constants";
import { RESOURCE_MONITOR_CONSTANTS } from "../constants/resource-monitor-constants";
import { MS_PER_SECOND } from "../constants/time-constants";
import { ensureLogsDirSync, isDevelopment, LOGS_DIR } from "../utils/logs-dir";

const MAX_PROCESSING_TIMES_HISTORY = 1000;

interface JobMetrics {
  queueName: string;
  pending: number;
  active: number;
  completed: number;
  failed: number;
  archived: number;
}

interface QueueHealthMetrics {
  timestamp: string;
  queues: JobMetrics[];
  totalPending: number;
  totalActive: number;
  totalCompleted: number;
  totalFailed: number;
}

@Injectable()
export class QueueMonitorService implements OnModuleInit {
  private readonly logger = new Logger(QueueMonitorService.name);
  private readonly metricsLogFile: string;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly jobStartTimes: Map<string, number> = new Map();

  // Track job processing times
  private readonly processingTimes: Map<string, number[]> = new Map();

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private dataSource: DataSource,
  ) {
    ensureLogsDirSync();
    this.metricsLogFile = path.join(LOGS_DIR, "queue-metrics.log");
  }

  async onModuleInit() {
    // Start monitoring every 60 seconds
    const intervalSeconds = parseInt(
      process.env.QUEUE_MONITOR_INTERVAL_SECONDS || "60",
      10,
    );
    this.monitoringInterval = setInterval(() => {
      this.collectMetrics().catch((err) => {
        this.logger.error("Error collecting queue metrics:", err);
      });
    }, intervalSeconds * MS_PER_SECOND);

    // Collect initial metrics
    await this.collectMetrics();
    this.logger.log(`Queue monitoring started (interval: ${intervalSeconds}s)`);
  }

  onModuleDestroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Track when a job starts processing
   */
  trackJobStart(jobId: string, queueName: string): void {
    const key = `${queueName}:${jobId}`;
    this.jobStartTimes.set(key, Date.now());
  }

  /**
   * Track when a job completes and record processing time
   */
  trackJobComplete(jobId: string, queueName: string, success: boolean): void {
    const key = `${queueName}:${jobId}`;
    const startTime = this.jobStartTimes.get(key);

    if (startTime) {
      const processingTime = Date.now() - startTime;

      // Store processing time for this queue
      if (!this.processingTimes.has(queueName)) {
        this.processingTimes.set(queueName, []);
      }
      const times = this.processingTimes.get(queueName)!;
      times.push(processingTime);

      if (times.length > MAX_PROCESSING_TIMES_HISTORY) {
        times.shift();
      }

      this.jobStartTimes.delete(key);

      if (!success) {
        this.logger.warn(
          `Job ${jobId} in queue ${queueName} failed after ${processingTime}ms`,
        );
      }
    }
  }

  /**
   * Get processing time statistics for a queue
   */
  getProcessingTimeStats(queueName: string): {
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    count: number;
  } | null {
    const times = this.processingTimes.get(queueName);
    if (!times || times.length === 0) {
      return null;
    }

    const sorted = [...times].sort((itemA, itemB) => itemA - itemB);
    const count = sorted.length;
    const sum = sorted.reduce((acc, time) => acc + time, 0);
    const avg = sum / count;
    const p50 = sorted[Math.floor(count * RESOURCE_MONITOR_CONSTANTS.P50)];
    const p95 = sorted[Math.floor(count * RESOURCE_MONITOR_CONSTANTS.P95)];
    const p99 = sorted[Math.floor(count * RESOURCE_MONITOR_CONSTANTS.P99)];

    return { avg, p50, p95, p99, count };
  }

  /**
   * Collect metrics from all queues
   */
  async collectMetrics(): Promise<void> {
    try {
      const monitoredQueues = [
        JOB_NAMES.FETCH_USER_EMAILS,
        // Legacy
        JOB_NAMES.SYNC_EMAILS,
        JOB_NAMES.SCHEDULE_EMAIL_FETCH_JOBS,
        JOB_NAMES.SYNC_GMAIL,
        JOB_NAMES.SCAN_HISTORY,
        JOB_NAMES.SCAN_HISTORY_EMAIL,
        JOB_NAMES.REFINE_PRIORITY,
        JOB_NAMES.GENERATE_SUMMARY,
        JOB_NAMES.LEARN_FROM_STAR,
        JOB_NAMES.ANALYZE_SCAN_RESULTS,
        JOB_NAMES.ANALYZE_CONTEXT,
      ];

      const queueMetrics = await this.queryAllQueueMetrics(monitoredQueues);
      const healthMetrics = this.buildHealthMetrics(queueMetrics);

      this.logMetricsToFile(healthMetrics);
      this.checkThresholds(healthMetrics);
      this.logProcessingTimeStats(monitoredQueues);
    } catch (error) {
      this.logger.error("Error collecting queue metrics:", error);
    }
  }

  private async queryAllQueueMetrics(
    monitoredQueues: string[],
  ): Promise<JobMetrics[]> {
    const queueMetrics: JobMetrics[] = [];

    for (const queueName of monitoredQueues) {
      try {
        // Query pg-boss job table directly for job counts by state
        // Note: 'archived' is not a valid state - completed jobs may be archived to a separate table
        const result = await this.dataSource.query(
          `SELECT
            COUNT(*) FILTER (WHERE state = 'created') as pending,
            COUNT(*) FILTER (WHERE state = 'active') as active,
            COUNT(*) FILTER (WHERE state = 'completed') as completed,
            COUNT(*) FILTER (WHERE state = 'failed') as failed
          FROM pgboss.job
          WHERE name = $1`,
          [queueName],
        );

        const counts = result[0] || {};
        const metrics: JobMetrics = {
          queueName,
          pending: parseInt(counts.pending || "0", 10),
          active: parseInt(counts.active || "0", 10),
          completed: parseInt(counts.completed || "0", 10),
          failed: parseInt(counts.failed || "0", 10),
          archived: 0,
          // Archived jobs are in a separate table, not a state
        };

        queueMetrics.push(metrics);
      } catch (error) {
        this.logger.warn(
          `Failed to get metrics for queue ${queueName}:`,
          error,
        );
      }
    }

    return queueMetrics;
  }

  private buildHealthMetrics(queueMetrics: JobMetrics[]): QueueHealthMetrics {
    let totalPending = 0;
    let totalActive = 0;
    let totalCompleted = 0;
    let totalFailed = 0;

    for (const metrics of queueMetrics) {
      totalPending += metrics.pending;
      totalActive += metrics.active;
      totalCompleted += metrics.completed;
      totalFailed += metrics.failed;
    }

    return {
      timestamp: new Date().toISOString(),
      queues: queueMetrics,
      totalPending,
      totalActive,
      totalCompleted,
      totalFailed,
    };
  }

  private logMetricsToFile(metrics: QueueHealthMetrics): void {
    // Development only. In production the container filesystem is read-only, so
    // the write throws ENOENT every time and the error log itself becomes
    // high-volume CloudWatch spam.
    if (!isDevelopment) return;
    const logLine = `${JSON.stringify(metrics)}\n`;
    try {
      fs.appendFileSync(this.metricsLogFile, logLine);
    } catch (error) {
      this.logger.error("Failed to write queue metrics to file:", error);
    }
  }

  private checkThresholds(metrics: QueueHealthMetrics): void {
    if (metrics.totalPending > QUEUE_CONSTANTS.MAX_QUEUE_SIZE) {
      this.logger.warn(
        `⚠️ High queue depth: ${metrics.totalPending} pending jobs across all queues`,
      );
    }
    if (metrics.totalActive > QUERY_LIMITS.MAX_SENT_EMAILS_FOR_STYLE) {
      this.logger.warn(
        `⚠️ High active jobs: ${metrics.totalActive} jobs currently processing`,
      );
    }
  }

  private logProcessingTimeStats(monitoredQueues: string[]): void {
    for (const queueName of monitoredQueues) {
      const stats = this.getProcessingTimeStats(queueName);
      if (stats && stats.count > 10) {
        this.logger.debug(
          `Queue ${queueName} processing times: avg=${Math.round(stats.avg)}ms, ` +
            `p50=${stats.p50}ms, p95=${stats.p95}ms, p99=${stats.p99}ms (n=${stats.count})`,
        );
      }
    }
  }

  /**
   * Get current queue health summary
   */
  async getQueueHealth(): Promise<QueueHealthMetrics> {
    const queueNames = [
      JOB_NAMES.FETCH_USER_EMAILS,
      // Legacy
      JOB_NAMES.SYNC_EMAILS,
      JOB_NAMES.SCHEDULE_EMAIL_FETCH_JOBS,
      JOB_NAMES.SYNC_GMAIL,
      JOB_NAMES.SCAN_HISTORY,
      JOB_NAMES.SCAN_HISTORY_EMAIL,
      JOB_NAMES.REFINE_PRIORITY,
      JOB_NAMES.GENERATE_SUMMARY,
      JOB_NAMES.LEARN_FROM_STAR,
      JOB_NAMES.ANALYZE_SCAN_RESULTS,
      JOB_NAMES.ANALYZE_CONTEXT,
    ];

    const queueMetrics: JobMetrics[] = [];
    let totalPending = 0;
    let totalActive = 0;
    let totalCompleted = 0;
    let totalFailed = 0;

    for (const queueName of queueNames) {
      try {
        // Query pg-boss job table directly for job counts by state
        // Note: 'archived' is not a valid state - completed jobs may be archived to a separate table
        const result = await this.dataSource.query(
          `SELECT 
            COUNT(*) FILTER (WHERE state = 'created') as pending,
            COUNT(*) FILTER (WHERE state = 'active') as active,
            COUNT(*) FILTER (WHERE state = 'completed') as completed,
            COUNT(*) FILTER (WHERE state = 'failed') as failed
          FROM pgboss.job
          WHERE name = $1`,
          [queueName],
        );

        const counts = result[0] || {};
        const metrics: JobMetrics = {
          queueName,
          pending: parseInt(counts.pending || "0", 10),
          active: parseInt(counts.active || "0", 10),
          completed: parseInt(counts.completed || "0", 10),
          failed: parseInt(counts.failed || "0", 10),
          archived: 0,
          // Archived jobs are in a separate table, not a state
        };

        queueMetrics.push(metrics);
        totalPending += metrics.pending;
        totalActive += metrics.active;
        totalCompleted += metrics.completed;
        totalFailed += metrics.failed;
      } catch (error) {
        this.logger.warn(
          `Failed to get metrics for queue ${queueName}:`,
          error,
        );
      }
    }

    return {
      timestamp: new Date().toISOString(),
      queues: queueMetrics,
      totalPending,
      totalActive,
      totalCompleted,
      totalFailed,
    };
  }
}
