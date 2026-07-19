import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import type { PgBoss } from "pg-boss";

import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { SECONDS } from "../constants/time-constants";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { StructuralError } from "../errors/structural-error";
import { getJobPriority } from "../queue/job-priorities";
import { registerWorker } from "../queue/register-worker";
import { AutoResponderService } from "./auto-responder.service";
import { QUEUE_CONFIG } from "./auto-responder-constants";
import { autoresponderLogger } from "./autoresponder-logger";

interface AutoResponderJobData {
  userId: string;
  emailThreadId: string;
  headers?: Record<string, string>;
}

@Injectable()
export class AutoResponderProcessor implements OnModuleInit {
  private readonly logger = new Logger(AutoResponderProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    private autoResponderService: AutoResponderService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    // Register worker for auto-responder jobs
    await registerWorker(
      this.boss,
      JOB_NAMES.AUTO_RESPONDER,
      {
        // Process up to 5 jobs concurrently
        teamConcurrency: 5,
        teamSize: 1,
      },
      async (job) => {
        const { userId, emailThreadId, headers } =
          job.data as AutoResponderJobData;
        this.logger.debug(
          `Processing auto-responder job for thread ${emailThreadId}`,
        );

        try {
          // processEmailForAutoResponse reads encrypted Email + EmailThread
          // columns and writes encrypted reply drafts. Wrap with the user's
          // KMS key so transformers operate under per-user envelope encryption.
          const result = await this.userEncryptionService.withUserKey(
            userId,
            () =>
              this.autoResponderService.processEmailForAutoResponse(
                userId,
                emailThreadId,
                headers,
              ),
          );

          this.logger.log(
            `Auto-responder result for thread ${emailThreadId}: ${result.reason}`,
          );

          return result;
        } catch (error) {
          // Check if this is a structural error (missing prompts, config issues, etc.)
          // These should fail immediately without retrying
          if (StructuralError.isStructuralError(error)) {
            this.logger.error(
              `[STRUCTURAL ERROR - NO RETRY] Auto-responder job failed for thread ${emailThreadId}: ${error.message}`,
            );
            // Return an error object instead of throwing to prevent retries
            // PgBoss treats thrown errors as retriable, but returning signals completion (even with error info)
            return {
              error: "StructuralError",
              message: error.message,
              threadId: emailThreadId,
            };
          }

          // For all other errors, log and re-throw to allow retries
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
    const logContext = { userId, emailThreadId };

    try {
      const jobId = await this.boss.send(
        JOB_NAMES.AUTO_RESPONDER,
        {
          userId,
          emailThreadId,
          headers,
        } as AutoResponderJobData,
        {
          priority: getJobPriority(JOB_NAMES.AUTO_RESPONDER),
          retryLimit: 2,
          retryDelay: QUEUE_CONFIG.RETRY_DELAY_SECONDS,
          // Expire after 1 hour
          expireInSeconds: SECONDS.HOUR,
          // Prevent duplicate jobs for same thread
          singletonKey: `auto-responder-${emailThreadId}`,
        },
      );

      this.logger.debug(
        `Queued auto-responder job ${jobId} for thread ${emailThreadId}`,
      );

      autoresponderLogger.logQueueJob(logContext, jobId, true);

      return jobId;
    } catch (error) {
      this.logger.error(
        `Failed to queue auto-responder job for thread ${emailThreadId}`,
        error,
      );

      autoresponderLogger.logQueueJob(logContext, null, false);

      return null;
    }
  }
}
