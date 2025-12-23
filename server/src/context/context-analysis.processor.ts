import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as os from "os";
import PgBoss = require("pg-boss");
import { ContextService } from "./context.service";
import { UsersService } from "../users/users.service";

@Injectable()
export class ContextAnalysisProcessor implements OnModuleInit {
  private readonly logger = new Logger(ContextAnalysisProcessor.name);
  private readonly contextConcurrency: number;

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    private contextService: ContextService,
    private usersService: UsersService,
    private configService: ConfigService,
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
    await this.boss.work(
      "analyze-context",
      { teamSize: this.contextConcurrency } as any,
      async (job) => {
        const { userId } = job.data as { userId: string };
        const workerId = job.id || "unknown";
        this.logger.log(
          `[Worker ${workerId}] Starting context analysis for user ${userId}`,
        );

        try {
          await this.contextService.analyzeAndLearnFromEmails(userId);
          this.logger.log(
            `[Worker ${workerId}] Completed context analysis for user ${userId}`,
          );
        } catch (error: any) {
          this.logger.error(
            `[Worker ${workerId}] Failed context analysis for user ${userId}`,
            error,
          );
          // Error state is already set by ContextService.analyzeAndLearnFromEmails
          // Just re-throw to mark job as failed
          throw error;
        }
      },
    );

    this.logger.log("Context analysis worker registered successfully");
  }
}
