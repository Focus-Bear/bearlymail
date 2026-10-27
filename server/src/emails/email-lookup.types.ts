import type { Email } from "../database/entities/email.entity";

/**
 * The two email reads the summary pipeline needs. Typed narrowly so the
 * prioritisation Lambda can supply them from EmailCrudService/EmailThreadService
 * without constructing EmailsService and its whole dependency graph; the Nest
 * app still injects EmailsService, which satisfies this.
 */
export interface EmailLookup {
  getEmailById(userId: string, emailId: string): Promise<Email>;
  getThreadEmails(
    userId: string,
    threadId: string,
    options?: { limit?: number; order?: "ASC" | "DESC" },
  ): Promise<Email[]>;
}
