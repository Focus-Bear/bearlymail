import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import type { PgBoss, WorkOptions } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { registerWorker } from "../queue/register-worker";
import { ScanAnalysisService } from "./scan-analysis.service";

@Injectable()
export class ScanAnalysisProcessor implements OnModuleInit {
  private readonly logger = new Logger(ScanAnalysisProcessor.name);
  private readonly analysisConcurrency: number;

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private readonly scanAnalysisService: ScanAnalysisService,
    private readonly userEncryptionService: UserEncryptionService,
    private configService: ConfigService,
  ) {
    // Get CPU cores for optimal concurrency
    const cpuCores = os.cpus().length;
    // For analysis jobs (CPU/DB bound), use moderate concurrency
    const defaultConcurrency = Math.max(2, Math.min(cpuCores, 3));

    this.analysisConcurrency = parseInt(
      this.configService.get<string>("JOB_ANALYSIS_CONCURRENCY") ||
        String(defaultConcurrency),
      10,
    );

    this.logger.log(
      `CPU cores: ${cpuCores}, analyze-scan-results concurrency: ${this.analysisConcurrency}`,
    );
  }

  async onModuleInit() {
    // Worker for analyzing scan results after scan completes - process multiple jobs in parallel
    this.logger.log(
      `Registering analyze-scan-results worker with concurrency: ${this.analysisConcurrency}`,
    );
    await registerWorker(
      this.boss,
      JOB_NAMES.ANALYZE_SCAN_RESULTS,
      // teamSize is a valid pg-boss work option for parallel job processing
      { teamSize: this.analysisConcurrency } as WorkOptions,
      async (job) => {
        const { userId } = job.data as { userId: string };
        const workerId = job.id || "unknown";
        this.logger.log(
          `[Worker ${workerId}] Starting analysis of scan results for user ${userId}`,
        );
        try {
          // Wrap in the user's KMS key context: analyzeScanResults reads
          // per-user-encrypted scan_emails and writes user_contexts, which fail
          // (and previously crashed the worker) without the per-user key.
          await this.userEncryptionService.withUserKey(userId, () =>
            this.scanAnalysisService.analyzeScanResults(userId),
          );
          this.logger.log(
            `[Worker ${workerId}] Completed analysis for user ${userId}`,
          );
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to analyze scan results for user ${userId}:`,
            error,
          );
          throw error;
          // Re-throw to allow retry
        }
      },
    );
    this.logger.log("analyze-scan-results worker registered successfully");
  }
}
