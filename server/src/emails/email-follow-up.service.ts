import { Injectable, Logger } from "@nestjs/common";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UsersService } from "../users/users.service";
import { EmailThreadService } from "./email-thread.service";
import { InboxEmail } from "./interfaces/inbox-email.interface";
import { PerformanceTracker } from "./performance-tracker";

/**
 * Handles follow-up / action-mode post-query filtering for the inbox.
 * Extracted from EmailInboxService to keep that class under 800 lines.
 */
@Injectable()
export class EmailFollowUpService {
  private readonly logger = new Logger(EmailFollowUpService.name);

  constructor(
    private usersService: UsersService,
    private emailThreadService: EmailThreadService,
  ) {}

  async filterActionModeEmails(
    userId: string,
    emails: InboxEmail[],
    perf: PerformanceTracker,
  ): Promise<InboxEmail[]> {
    const end = perf.startSpan(
      "action_user_sent_last_filter",
      QUERY_LIMITS.INBOX_PROCESS_TOTAL,
    );
    try {
      const user = await this.usersService.findOne(userId);
      if (user) {
        const userEmail = EncryptionHelper.tryDecrypt(user.email)?.toLowerCase();
        if (userEmail) {
          const before = emails.length;
          const result = emails.filter(
            (emailItem) => (emailItem.from?.toLowerCase() || "") !== userEmail,
          );
          if (result.length < before)
            this.logger.debug(
              `Action mode: Filtered ${before - result.length} threads where user sent the last email`,
            );
          return result;
        }
      }
    } catch (error) {
      this.logger.warn(
        "Failed to filter action mode by user-sent-last:",
        error,
      );
    } finally {
      end();
    }
    return emails;
  }

  async filterFollowUpModeEmails(
    userId: string,
    emails: InboxEmail[],
    perf: PerformanceTracker,
  ): Promise<InboxEmail[]> {
    const end = perf.startSpan("follow_up_filter", QUERY_LIMITS.INBOX_TOTAL);
    const unsnoozed = emails.filter(
      (emailItem) =>
        !emailItem.isSnoozed ||
        (emailItem.snoozeUntil && new Date(emailItem.snoozeUntil) < new Date()),
    );
    const result: InboxEmail[] = [];
    for (const email of unsnoozed) {
      try {
        const status = await this.checkThreadFollowUpStatus(
          userId,
          email.threadId,
        );
        if (status.userSentLast && !status.replyReceived) {
          email.lastTheirReplyAt = status.lastTheirReplyAt?.toISOString();
          email.lastMyReplyAt = status.lastMyReplyAt?.toISOString();
          result.push(email);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to check follow-up status for thread ${email.threadId}:`,
          error,
        );
      }
    }
    end();
    return result;
  }

  async checkThreadFollowUpStatus(
    userId: string,
    threadId: string,
  ): Promise<{
    userSentLast: boolean;
    replyReceived: boolean;
    lastTheirReplyAt: Date | null;
    lastMyReplyAt: Date | null;
  }> {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    const userEmail = EncryptionHelper.tryDecrypt(user.email);

    try {
      const threadEmails = await this.emailThreadService.getThreadEmails(
        userId,
        threadId,
        { order: "ASC" },
      );
      if (threadEmails.length === 0)
        return {
          userSentLast: false,
          replyReceived: false,
          lastTheirReplyAt: null,
          lastMyReplyAt: null,
        };

      let lastTheirReplyAt: Date | null = null;
      let lastMyReplyAt: Date | null = null;

      for (const email of threadEmails) {
        const isFromUser =
          (email.from?.toLowerCase() || "") === userEmail.toLowerCase();
        if (isFromUser) lastMyReplyAt = email.receivedAt;
        else lastTheirReplyAt = email.receivedAt;
      }

      const lastEmail = threadEmails[threadEmails.length - 1];
      const userSentLast =
        (lastEmail.from?.toLowerCase() || "") === userEmail.toLowerCase();
      const effectiveUserSentLast =
        userSentLast && !lastEmail.sentByAutoResponder;
      const replyReceived = Boolean(
        !effectiveUserSentLast ||
        (lastTheirReplyAt && lastMyReplyAt && lastTheirReplyAt > lastMyReplyAt),
      );

      return {
        userSentLast: effectiveUserSentLast,
        replyReceived,
        lastTheirReplyAt,
        lastMyReplyAt,
      };
    } catch (error) {
      this.logger.error(
        `Error checking thread follow-up status for ${threadId}:`,
        error,
      );
      throw error;
    }
  }
}
