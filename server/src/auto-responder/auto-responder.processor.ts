import { Injectable, Logger, OnModuleInit, Inject } from "@nestjs/common";
import PgBoss from "pg-boss";
import { AutoResponderService } from "./auto-responder.service";
import { getJobPriority } from "../queue/job-priorities";

interface AutoResponderJobData {
  userId: string;
  emailThreadId: string;
  headers?: Record<string, string>;
}

@Injectable()
export class AutoResponderProcessor implements OnModuleInit {
  private readonly logger = new Logger(AutoResponderProcessor.name);

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    private autoResponderService: AutoResponderService,
  ) {}

  async onModuleInit() {
    // Register worker for auto-responder jobs
    await this.boss.work(
      "auto-responder",
      {
        teamConcurrency: 5, // Process up to 5 jobs concurrently
        teamSize: 1,
      },
      async (job) => {
        const { userId, emailThreadId, headers } = job.data as AutoResponderJobData;
        this.logger.debug(
          `Processing auto-responder job for thread ${emailThreadId}`,
        );

        try {
          const result = await this.autoResponderService.processEmailForAutoResponse(
            userId,
            emailThreadId,
            headers,
          );

          this.logger.log(
            `Auto-responder result for thread ${emailThreadId}: ${result.reason}`,
          );

          return result;
        } catch (error) {
          this.logger.error(
            `Failed to process auto-responder job for thread ${emailThreadId}`,
            error,
          );
          throw error;
        }
      },
    );

    this.logger.log("Auto-responder processor initialized");
  }

  /**
   * Queue an auto-responder job for processing
   * Called after email triage is complete
   */
  async queueAutoResponseJob(
    userId: string,
    emailThreadId: string,
    headers?: Record<string, string>,
  ): Promise<string | null> {
    try {
      const jobId = await this.boss.send(
        "auto-responder",
        {
          userId,
          emailThreadId,
          headers,
        } as AutoResponderJobData,
        {
          priority: getJobPriority("auto-responder"),
          retryLimit: 2,
          retryDelay: 30, // 30 seconds
          expireInMinutes: 60, // Expire after 1 hour
          singletonKey: `auto-responder-${emailThreadId}`, // Prevent duplicate jobs for same thread
        },
      );

      this.logger.debug(
        `Queued auto-responder job ${jobId} for thread ${emailThreadId}`,
      );

      return jobId;
    } catch (error) {
      this.logger.error(
        `Failed to queue auto-responder job for thread ${emailThreadId}`,
        error,
      );
      return null;
    }
  }
}
