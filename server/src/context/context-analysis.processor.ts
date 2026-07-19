import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import type { PgBoss } from "pg-boss";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { registerWorker } from "../queue/register-worker";
import { UsersService } from "../users/users.service";
import { ContextService } from "./context.service";
import { writeAnalysisLog } from "./context-analysis-logger";

@Injectable()
export class ContextAnalysisProcessor implements OnModuleInit {
  private readonly logger = new Logger(ContextAnalysisProcessor.name);
  private readonly contextConcurrency: number;

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private contextService: ContextService,
    private usersService: UsersService,
    private configService: ConfigService,
    private cloudWatchService: CloudWatchService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {
    // Get CPU cores for optimal concurrency
    const cpuCores = os.cpus().length;
    // For context analysis (CPU/LLM bound), use moderate concurrency to avoid rate limits
    const defaultConcurrency = Math.max(2, Math.min(cpuCores, 3));

    this.contextConcurrency = parseInt(
      this.configService.get<string>("JOB_CONTEXT_CONCURRENCY") ||
        String(defaultConcurrency),
      10,
    );

    this.logger.log(
      `CPU cores: ${cpuCores}, analyze-context concurrency: ${this.contextConcurrency}`,
    );
  }

  async onModuleInit() {
    // Worker for context analysis - process multiple jobs in parallel
    this.logger.log(
      `Registering context-analysis worker with concurrency: ${this.contextConcurrency}`,
    );
    writeAnalysisLog(
      `===== Context Analysis Worker Registered ===== (concurrency: ${this.contextConcurrency})`,
      "log",
    );
    await registerWorker(
      this.boss,
      JOB_NAMES.ANALYZE_CONTEXT,
      { teamSize: this.contextConcurrency } as { teamSize: number },
      async (job) => {
        const { userId, analysisId } = job.data as {
          userId: string;
          analysisId?: string;
        };
        const workerId = job.id || "unknown";
        const tracker = new JobPerformanceTracker(
          JOB_NAMES.ANALYZE_CONTEXT,
          workerId,
          this.cloudWatchService,
        );
        tracker.setMetadata({ userId });

        this.logger.log(
          `[Worker ${workerId}] Job received for user ${userId}${analysisId ? ` with analysis ID ${analysisId}` : ""}`,
        );
        writeAnalysisLog(
          `[Worker ${workerId}] Job received for user ${userId}${analysisId ? ` with analysis ID ${analysisId}` : ""}`,
          "log",
        );

        await this.userEncryptionService.withUserKey(userId, async () => {
          try {
            this.logger.log(
              `[Worker ${workerId}] Starting context analysis for user ${userId}${analysisId ? ` with analysis ID ${analysisId}` : ""}`,
            );
            writeAnalysisLog(
              `[Worker ${workerId}] Starting context analysis for user ${userId}${analysisId ? ` with analysis ID ${analysisId}` : ""}`,
              "log",
            );
            await this.contextService.analyzeAndLearnFromEmails(
              userId,
              analysisId,
            );
            this.logger.log(
              `[Worker ${workerId}] Enqueued batch jobs for context analysis for user ${userId}. Analysis will complete when all batches finish.`,
            );
            writeAnalysisLog(
              `[Worker ${workerId}] Enqueued batch jobs for context analysis for user ${userId}`,
              "log",
            );
            tracker.finish();
          } catch (error: unknown) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.error(
              `[Worker ${workerId}] Failed context analysis for user ${userId}: ${errorMessage}`,
              errorStack || error,
            );
            tracker.finish(error as Error);
            writeAnalysisLog(
              `[Worker ${workerId}] Failed context analysis for user ${userId}: ${errorMessage}`,
              "error",
            );
            writeAnalysisLog(
              `[Worker ${workerId}] Error stack: ${errorStack || "No stack trace"}`,
              "error",
            );
            this.logger.error(
              `[Worker ${workerId}] Error details: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`,
            );
            writeAnalysisLog(
              `[Worker ${workerId}] Error details: ${JSON.stringify(error, Object.getOwnPropertyNames(error))}`,
              "error",
            );
            // Error state is already set by ContextService.analyzeAndLearnFromEmails
            // Just re-throw to mark job as failed
            throw error;
          }
        });
      },
    );

    this.logger.log("Context analysis worker registered successfully");
    writeAnalysisLog("Context analysis worker registered successfully", "log");
  }
}
