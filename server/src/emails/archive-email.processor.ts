import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import PgBoss = require("pg-boss");
import { EmailsService } from "./emails.service";
import { logErrorToFile } from "../utils/error-logger";

@Injectable()
export class ArchiveEmailProcessor implements OnModuleInit {
  private readonly logger = new Logger(ArchiveEmailProcessor.name);

  constructor(
    @Inject("PG_BOSS") private readonly boss: PgBoss,
    private readonly emailsService: EmailsService,
  ) {}

  async onModuleInit() {
    // Register worker for archive-email jobs
    await this.boss.work("archive-email", async (job) => {
      const { userId, emailId } = job.data as {
        userId: string;
        emailId: string;
      };

      this.logger.log(
        `[Archive Job] Processing archive job: userId=${userId}, emailId=${emailId}`,
      );

      try {
        await this.emailsService.archiveEmail(userId, emailId);
        this.logger.log(
          `[Archive Job] Successfully archived email: userId=${userId}, emailId=${emailId}`,
        );
      } catch (error: unknown) {
        this.logger.error(
          `[Archive Job] Failed to archive email: userId=${userId}, emailId=${emailId}`,
          error,
        );
        logErrorToFile(
          `Failed to archive email in background job (userId: ${userId}, emailId: ${emailId})`,
          error,
          "ArchiveEmailProcessor",
        );
        // Re-throw to let pg-boss handle retries
        throw error;
      }
    });

    this.logger.log(
      "ArchiveEmailProcessor initialized - archive-email job handler registered",
    );
  }
}
