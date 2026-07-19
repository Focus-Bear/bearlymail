import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PgBoss, WorkOptions } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { registerWorker } from "../queue/register-worker";
import {
  EmailExportJobService,
  ExportEmailsJobData,
} from "./email-export-job.service";

/**
 * Worker that builds bulk email exports off the HTTP request path.
 *
 * Wraps the work in `withUserKey(userId, ...)` because background jobs do not go
 * through the HTTP encryption interceptor — without it, TypeORM transformers and
 * the export-password decrypt would use the wrong (or no) key when KMS is enabled.
 */
@Injectable()
export class EmailExportProcessor implements OnModuleInit {
  private readonly logger = new Logger(EmailExportProcessor.name);
  private readonly concurrency: number;

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private readonly boss: PgBoss,
    private readonly exportJobService: EmailExportJobService,
    private readonly userEncryptionService: UserEncryptionService,
    private readonly configService: ConfigService,
  ) {
    // Default to 1: building an export streams a whole mailbox through this
    // process, so running several at once per worker would multiply peak memory.
    const parsed = parseInt(
      this.configService.get<string>("JOB_EXPORT_CONCURRENCY") || "",
      10,
    );
    this.concurrency = Number.isNaN(parsed) ? 1 : parsed;
  }

  async onModuleInit() {
    this.logger.log(
      `Registering export-emails worker with concurrency: ${this.concurrency}`,
    );

    await registerWorker(
      this.boss,
      JOB_NAMES.EXPORT_EMAILS,
      { teamSize: this.concurrency } as WorkOptions,
      async (job) => {
        const jobData = job.data as ExportEmailsJobData;
        const workerId = job.id || "unknown";

        this.logger.log(
          `[Worker ${workerId}] Starting email export ${jobData.exportId} for user ${jobData.userId}`,
        );

        await this.userEncryptionService.withUserKey(
          jobData.userId,
          async () => {
            await this.exportJobService.runExport(jobData);
          },
        );
      },
    );

    this.logger.log("export-emails worker registered successfully");
  }
}
