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
// pg-boss v12 is ESM-only, so the CommonJS build can't `require()` it. Import
// the type for annotations and load the constructor via dynamic import() inside
// the async factory below (CJS can import ESM dynamically).
import type { PgBoss } from "pg-boss";

import { AwsModule } from "../aws/aws.module";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { logErrorToFile } from "../utils/error-logger";
import { esmImport } from "../utils/esm-import.util";
import { QueueAutoscalingService } from "./queue-autoscaling.service";
import { QueueMonitorService } from "./queue-monitor.service";
import { ResourceMonitorService } from "./resource-monitor.service";
import { startBossWithDeadlockRetry } from "./start-boss-with-deadlock-retry";

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
        // nosemgrep
        const useSsl = sslRequired ? { rejectUnauthorized: false } : false;

        // Safer default: 4 processes × 5 = 20 PgBoss connections
        const pgBossPoolSize = parseInt(
          configService.get<string>("DB_PGBOSS_POOL_SIZE") || "5",
          10,
        );

        // Dynamic import: pg-boss v12 is ESM-only and this is the CommonJS build.
        const { PgBoss: PgBossCtor } =
          await esmImport<typeof import("pg-boss")>("pg-boss");
        const boss = new PgBossCtor({
          connectionString: `postgres://${configService.get("DB_USERNAME")}:${configService.get("DB_PASSWORD")}@${configService.get("DB_HOST")}:${configService.get("DB_PORT")}/${configService.get("DB_NAME")}`,
          ssl: useSsl,
          // Explicit connection pool limit. PgBoss creates its own pg.Pool
          // separate from TypeORM, so without this it can exhaust the database's
          // max_connections alongside the TypeORM pool. Tune DB_PGBOSS_POOL_SIZE
          // in production based on your RDS instance's max_connections limit.
          max: pgBossPoolSize,
          // pg-boss v10 replaced `noSupervisor` with `supervise` (defaults to
          // true). Job defaults (retry/expire/delete) are no longer constructor
          // options in v11 — they are per-queue policies applied via
          // createQueue() below (see DEFAULT_QUEUE_OPTIONS).
        });

        // Handle connection errors gracefully
        boss.on("error", (error) => {
          logger.error("PgBoss connection error:", error);
          logErrorToFile("PgBoss connection error", error, "QueueModule");
          // Don't throw - let pg-boss handle reconnection
        });

        // (pg-boss v11 removed the `monitor-states` event; queue health is now
        // observed via getQueues() in QueueMonitorService.)

        try {
          await startBossWithDeadlockRetry(boss, logger);
          logger.log("PgBoss started successfully");

          // pg-boss v10+ requires every queue to be created before it can be
          // used by send()/work(). Register all known job queues up front, here
          // in the factory, so they exist before any module's bootstrap hooks
          // start producing or consuming. createQueue is idempotent.
          //
          // v11 moved retry/retention defaults off the constructor onto
          // per-queue policies, so apply them here as the default for every
          // queue (matches the previous global defaults).
          const DEFAULT_QUEUE_OPTIONS = {
            retryLimit: 3,
            retryDelay: 10,
            retryBackoff: false,
            expireInSeconds: SECONDS.FIFTEEN_MINUTES,
            retentionSeconds: SECONDS.DAY,
          };
          for (const queueName of Object.values(JOB_NAMES)) {
            await boss.createQueue(queueName, DEFAULT_QUEUE_OPTIONS);
          }
          logger.log(
            `Registered ${Object.values(JOB_NAMES).length} pg-boss queues`,
          );

          // Set up automatic reconnection handling
          boss.on("stopped", () => {
            logger.warn("PgBoss stopped, attempting to restart...");
            startBossWithDeadlockRetry(boss, logger).catch((err) => {
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
