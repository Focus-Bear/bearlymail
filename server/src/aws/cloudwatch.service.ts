import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CloudWatchClient,
  PutMetricDataCommand,
  StandardUnit,
} from "@aws-sdk/client-cloudwatch";

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
}
