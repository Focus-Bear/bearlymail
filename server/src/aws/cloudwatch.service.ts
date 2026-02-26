import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CloudWatchClient,
  PutMetricDataCommand,
  StandardUnit,
} from "@aws-sdk/client-cloudwatch";
import { QUERY_LIMITS } from "../constants/query-limits";

@Injectable()
export class CloudWatchService {
  private readonly logger = new Logger(CloudWatchService.name);
  private readonly client: CloudWatchClient | null;
  private readonly namespace: string;
  private readonly enabled: boolean;

  constructor(private configService: ConfigService) {
    this.enabled =
      this.configService.get<string>("AUTOSCALING_ENABLED") !== "false";
    this.namespace =
      this.configService.get<string>("CLOUDWATCH_METRIC_NAMESPACE") ||
      "BearlyMail/Queue";

    // Check if we're in local development
    const nodeEnv = this.configService.get<string>("NODE_ENV");
    const dbHost = this.configService.get<string>("DB_HOST");
    const isLocalDev =
      nodeEnv === "development" ||
      dbHost === "localhost" ||
      dbHost === "127.0.0.1";

    if (this.enabled && !isLocalDev) {
      const region =
        this.configService.get<string>("AWS_REGION") || "us-east-1";
      this.client = new CloudWatchClient({ region });
      this.logger.log(
        `CloudWatch service initialized (namespace: ${this.namespace}, region: ${region})`,
      );
    } else {
      this.client = null;
      if (isLocalDev) {
        this.logger.log("CloudWatch service disabled (local development mode)");
      } else {
        this.logger.log(
          "CloudWatch service disabled (AUTOSCALING_ENABLED=false)",
        );
      }
    }
  }

  /**
   * Publish a custom metric to CloudWatch
   */
  async putMetric(
    metricName: string,
    value: number,
    unit: StandardUnit = StandardUnit.None,
  ): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Timestamp: new Date(),
          },
        ],
      });

      await this.client.send(command);
      this.logger.debug(
        `Published metric ${metricName}=${value} to CloudWatch`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to publish metric ${metricName} to CloudWatch:`,
        error,
      );
      // Don't throw - autoscaling should continue even if metrics fail
    }
  }

  /**
   * Publish multiple metrics in a single call
   */
  async putMetrics(
    metrics: Array<{ name: string; value: number; unit?: StandardUnit }>,
  ): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    try {
      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: metrics.map((metric) => ({
          MetricName: metric.name,
          Value: metric.value,
          Unit: metric.unit || StandardUnit.None,
          Timestamp: new Date(),
        })),
      });

      await this.client.send(command);
      this.logger.debug(`Published ${metrics.length} metrics to CloudWatch`);
    } catch (error) {
      this.logger.error("Failed to publish metrics to CloudWatch:", error);
      // Don't throw - autoscaling should continue even if metrics fail
    }
  }

  /**
   * Publish a performance budget exceeded metric with dimensions to identify which budget was exceeded
   */
  async putPerformanceBudgetMetric(params: {
    budgetName: string;
    budgetType: "job" | "operation" | "batch";
    durationMs: number;
    budgetMs: number;
    exceeded: boolean;
    metadata?: Record<string, string>;
  }): Promise<void> {
    if (!this.enabled || !this.client) {
      return;
    }

    const { budgetName, budgetType, durationMs, budgetMs, exceeded, metadata } =
      params;

    try {
      const dimensions = [
        { Name: "BudgetName", Value: budgetName },
        { Name: "BudgetType", Value: budgetType },
      ];

      // Add any additional metadata as dimensions (limited to 30 dimensions per metric)
      if (metadata) {
        Object.entries(metadata)
          // Leave room for the required dimensions
          .slice(0, QUERY_LIMITS.CLOUDWATCH_MAX_DIMENSIONS)
          .forEach(([key, value]) => {
            if (value) {
              dimensions.push({ Name: key, Value: value });
            }
          });
      }

      const metricData = [
        // Count of budget exceeded occurrences (1 if exceeded, 0 if not)
        {
          MetricName: "PerformanceBudgetExceeded",
          Value: exceeded ? 1 : 0,
          Unit: StandardUnit.Count,
          Timestamp: new Date(),
          Dimensions: dimensions,
        },
        // Duration of the operation in milliseconds
        {
          MetricName: "PerformanceBudgetDuration",
          Value: durationMs,
          Unit: StandardUnit.Milliseconds,
          Timestamp: new Date(),
          Dimensions: dimensions,
        },
        // How much over/under budget (positive = over, negative = under)
        {
          MetricName: "PerformanceBudgetOverage",
          Value: durationMs - budgetMs,
          Unit: StandardUnit.Milliseconds,
          Timestamp: new Date(),
          Dimensions: dimensions,
        },
      ];

      const command = new PutMetricDataCommand({
        Namespace: this.namespace,
        MetricData: metricData,
      });

      await this.client.send(command);

      if (exceeded) {
        this.logger.debug(
          `Published performance budget exceeded: ${budgetName} (${budgetType}) ${durationMs}ms > ${budgetMs}ms`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to publish performance budget metric for ${budgetName}:`,
        error,
      );
      // Don't throw - metrics should not impact main functionality
    }
  }
}
