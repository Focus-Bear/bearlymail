import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import PgBoss = require("pg-boss");
import { ScanAnalysisService } from "./scan-analysis.service";

@Injectable()
export class ScanAnalysisProcessor implements OnModuleInit {
  private readonly logger = new Logger(ScanAnalysisProcessor.name);
  private readonly analysisConcurrency: number;

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    private readonly scanAnalysisService: ScanAnalysisService,
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
    await this.boss.work(
      "analyze-scan-results",
      { teamSize: this.analysisConcurrency } as any,
      async (job) => {
        const { userId } = job.data as { userId: string };
        const workerId = job.id || "unknown";
        this.logger.log(
          `[Worker ${workerId}] Starting analysis of scan results for user ${userId}`,
        );
        try {
          await this.scanAnalysisService.analyzeScanResults(userId);
          this.logger.log(
            `[Worker ${workerId}] Completed analysis for user ${userId}`,
          );
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to analyze scan results for user ${userId}:`,
            error,
          );
          throw error; // Re-throw to allow retry
        }
      },
    );
    this.logger.log("analyze-scan-results worker registered successfully");
  }
}
