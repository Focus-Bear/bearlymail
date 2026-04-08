import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import PgBoss from "pg-boss";

import { AwsModule } from "../aws/aws.module";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { logErrorToFile } from "../utils/error-logger";
import { QueueAutoscalingService } from "./queue-autoscaling.service";
import { QueueMonitorService } from "./queue-monitor.service";
import { ResourceMonitorService } from "./resource-monitor.service";

@Global()
@Module({
  imports: [ConfigModule, TypeOrmModule, AwsModule],
  providers: [
    {
      provide: INJECT_TOKENS.PG_BOSS,
      useFactory: async (configService: ConfigService) => {
        const logger = new Logger("QueueModule");
        const dbHost = configService.get<string>("DB_HOST");
        const isLocal = dbHost === "localhost" || dbHost === "127.0.0.1";
        const sslEnabled = configService.get<string>("DB_SSL") === "true";
        const sslDisabled = configService.get<string>("DB_SSL") === "false";
        const sslRequired = sslEnabled || (!isLocal && !sslDisabled);
        const useSsl = sslRequired ? { rejectUnauthorized: false } : false;

        // Safer default: 4 processes × 5 = 20 PgBoss connections
        const pgBossPoolSize = parseInt(
          configService.get<string>("DB_PGBOSS_POOL_SIZE") || "5",
          10,
        );

        const boss = new PgBoss({
          connectionString: `postgres://${configService.get("DB_USERNAME")}:${configService.get("DB_PASSWORD")}@${configService.get("DB_HOST")}:${configService.get("DB_PORT")}/${configService.get("DB_NAME")}`,
          ssl: useSsl,
          // Explicit connection pool limit. PgBoss creates its own pg.Pool
          // separate from TypeORM, so without this it can exhaust the database's
          // max_connections alongside the TypeORM pool. Tune DB_PGBOSS_POOL_SIZE
          // in production based on your RDS instance's max_connections limit.
          max: pgBossPoolSize,
          // Worker settings
          noSupervisor: false,
          // Job defaults - reasonable retry settings
          retryLimit: 3,
          retryDelay: 10,
          retryBackoff: false,
          expireInMinutes: 15,
          deleteAfterHours: 24,
          archiveCompletedAfterSeconds: 3600,
        });

        // Handle connection errors gracefully
        boss.on("error", (error) => {
          logger.error("PgBoss connection error:", error);
          logErrorToFile("PgBoss connection error", error, "QueueModule");
          // Don't throw - let pg-boss handle reconnection
        });

        // Handle worker errors - these are logged but don't crash the app
        boss.on("monitor-states", (_monitor) => {
          // Monitor is running, connection is healthy
        });

        try {
          await boss.start();
          logger.log("PgBoss started successfully");

          // Set up automatic reconnection handling
          boss.on("stopped", () => {
            logger.warn("PgBoss stopped, attempting to restart...");
            boss.start().catch((err) => {
              logger.error("Failed to restart PgBoss:", err);
              logErrorToFile("Failed to restart PgBoss", err, "QueueModule");
            });
          });
        } catch (error) {
          logger.error("Failed to start PgBoss:", error);
          logErrorToFile("Failed to start PgBoss", error, "QueueModule");
          throw error;
        }

        return boss;
      },
      inject: [ConfigService],
    },
    QueueMonitorService,
    ResourceMonitorService,
    QueueAutoscalingService,
  ],
  exports: [INJECT_TOKENS.PG_BOSS, QueueMonitorService, ResourceMonitorService],
})
export class QueueModule implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(QueueModule.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private queueMonitorService: QueueMonitorService,
    private resourceMonitorService: ResourceMonitorService,
    private queueAutoscalingService: QueueAutoscalingService,
  ) {}

  async onApplicationBootstrap() {
    // Boss started in useFactory
    // Set up error handlers
    this.boss.on("error", (error) => {
      this.logger.error("PgBoss error (handled):", error.message);
      logErrorToFile("PgBoss error (handled)", error, "QueueModule");
      // Connection errors are handled by pg-boss automatically with retry
    });
  }

  async onModuleDestroy() {
    try {
      // Stop monitoring services if they implement OnModuleDestroy
      // These services may optionally implement the lifecycle hook
      const destroyable = (service: unknown): service is OnModuleDestroy =>
        service !== null &&
        typeof service === "object" &&
        "onModuleDestroy" in service &&
        typeof (service as { onModuleDestroy: unknown }).onModuleDestroy ===
          "function";

      if (destroyable(this.queueMonitorService)) {
        await this.queueMonitorService.onModuleDestroy();
      }
      if (destroyable(this.resourceMonitorService)) {
        await this.resourceMonitorService.onModuleDestroy();
      }
      if (destroyable(this.queueAutoscalingService)) {
        await this.queueAutoscalingService.onModuleDestroy();
      }
      await this.boss.stop();
    } catch (error) {
      this.logger.error("Error stopping QueueModule:", error);
      logErrorToFile("Error stopping QueueModule", error, "QueueModule");
    }
  }
}

export const InjectBoss = () => Inject(INJECT_TOKENS.PG_BOSS);
