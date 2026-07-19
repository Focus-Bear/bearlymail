import { Injectable, Logger } from "@nestjs/common";

import { ScheduledEmailsService } from "./scheduled-emails.service";

@Injectable()
export class SendScheduledEmailsProcessor {
  private readonly logger = new Logger(SendScheduledEmailsProcessor.name);

  constructor(private scheduledEmailsService: ScheduledEmailsService) {}

  /**
   * Process scheduled emails that are due to be sent
   * This is called by the PgBoss worker
   */
  async process(): Promise<void> {
    this.logger.log("Processing scheduled emails...");

    try {
      const result = await this.scheduledEmailsService.sendDueEmails();

      if (result.sent > 0 || result.failed > 0) {
        this.logger.log(
          `Sent ${result.sent} scheduled emails, ${result.failed} failed`,
        );
      }

      if (result.errors.length > 0) {
        this.logger.error(
          `Errors while sending scheduled emails:`,
          result.errors,
        );
      }
    } catch (error) {
      this.logger.error("Failed to process scheduled emails:", error);
      throw error;
    }
  }
}
