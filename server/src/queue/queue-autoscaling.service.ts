import {
  Injectable,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  Inject,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DataSource } from "typeorm";
import { CloudWatchService } from "../aws/cloudwatch.service";
import { StandardUnit } from "@aws-sdk/client-cloudwatch";

@Injectable()
export class QueueAutoscalingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueAutoscalingService.name);
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly enabled: boolean;
  private readonly checkIntervalSeconds: number;
  private readonly minWorkers: number;
  private readonly maxWorkers: number;
  private readonly queueDepthPerWorker: number;

  // Queue names to monitor (same as QueueMonitorService)
  private readonly queueNames = [
    "fetch-user-emails",
    // Legacy
    "sync-emails",
    "schedule-email-fetch-jobs",
    "sync-gmail",
    "scan-history",
    "scan-history-email",
    "refine-priority",
    "generate-summary",
    "learn-from-star",
    "analyze-scan-results",
    "analyze-context",
  ];

  constructor(
    private dataSource: DataSource,
    private cloudWatchService: CloudWatchService,
    private configService: ConfigService,
  ) {
    this.enabled =
      this.configService.get<string>("AUTOSCALING_ENABLED") !== "false";
    this.checkIntervalSeconds = parseInt(
      this.configService.get<string>("AUTOSCALING_CHECK_INTERVAL_SECONDS") ||
        "30",
      10,
    );
    this.minWorkers = parseInt(
      this.configService.get<string>("AUTOSCALING_MIN_WORKERS") || "1",
      10,
    );
    this.maxWorkers = parseInt(
      this.configService.get<string>("AUTOSCALING_MAX_WORKERS") || "10",
      10,
    );
    this.queueDepthPerWorker = parseInt(
      this.configService.get<string>("AUTOSCALING_QUEUE_DEPTH_PER_WORKER") ||
        "50",
      10,
    );
  }

  // eslint-disable-next-line max-lines-per-function
  async onModuleInit() {
    // Only run autoscaling in web service, not in worker tasks
    const workerMode = this.configService.get<string>("WORKER_MODE");
    if (workerMode === "true") {
      this.logger.log("Autoscaling service disabled (running in worker mode)");
      return;
    }

    if (!this.enabled) {
      this.logger.log(
        "Autoscaling service disabled (AUTOSCALING_ENABLED=false)",
      );
      return;
    }

    this.logger.log(
      `Queue autoscaling service starting (interval: ${this.checkIntervalSeconds}s, min: ${this.minWorkers}, max: ${this.maxWorkers}, jobs/worker: ${this.queueDepthPerWorker})`,
    );

    // Start monitoring immediately
    await this.checkAndPublishMetrics();

    // Then set up interval
    this.monitoringInterval = setInterval(() => {
      this.checkAndPublishMetrics().catch((err) => {
        this.logger.error("Error in autoscaling check:", err);
      });
    }, this.checkIntervalSeconds * 1000);
  }

  async onModuleDestroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Check queue depth and publish metrics to CloudWatch
   */
  private async checkAndPublishMetrics(): Promise<void> {
    try {
      const queueDepth = await this.getTotalQueueDepth();
      const desiredWorkers = this.calculateDesiredWorkers(queueDepth);

      this.logger.debug(
        `Queue depth: ${queueDepth}, Desired workers: ${desiredWorkers}`,
      );

      // Publish metrics to CloudWatch
      await this.cloudWatchService.putMetrics([
        {
          name: "QueueDepth",
          value: queueDepth,
          unit: StandardUnit.Count,
        },
        {
          name: "DesiredWorkers",
          value: desiredWorkers,
          unit: StandardUnit.Count,
        },
      ]);
    } catch (error) {
      this.logger.error("Error checking queue depth:", error);
    }
  }

  /**
   * Get total pending jobs count across all monitored queues
   */
  private async getTotalQueueDepth(): Promise<number> {
    let totalPending = 0;

    for (const queueName of this.queueNames) {
      try {
        const result = await this.dataSource.query(
          `SELECT COUNT(*) as pending
           FROM pgboss.job
           WHERE name = $1 AND state = 'created'`,
          [queueName],
        );

        const count = parseInt(result[0]?.pending || "0", 10);
        totalPending += count;
      } catch (error) {
        this.logger.warn(`Failed to get queue depth for ${queueName}:`, error);
      }
    }

    return totalPending;
  }

  /**
   * Calculate desired worker count based on queue depth
   */
  private calculateDesiredWorkers(queueDepth: number): number {
    const calculated = Math.ceil(queueDepth / this.queueDepthPerWorker);
    return Math.max(this.minWorkers, Math.min(this.maxWorkers, calculated));
  }
}
