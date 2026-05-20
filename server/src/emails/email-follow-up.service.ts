import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { QUERY_LIMITS } from "../constants/query-limits";
import {
  FollowUp,
  FollowUpStatus,
} from "../database/entities/follow-up.entity";
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
    @InjectRepository(FollowUp)
    private followUpRepository: Repository<FollowUp>,
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
        const userEmail = EncryptionHelper.tryDecrypt(
          user.email,
        )?.toLowerCase();
        if (userEmail) {
          const before = emails.length;
          const result = emails.filter(
            (emailItem) =>
              (emailItem.from?.toLowerCase() || "") !== userEmail ||
              emailItem.sentByAutoResponder === true,
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
    const now = new Date();

    this.logSnoozeMismatchDebug(emails, now);

    const unsnoozed = emails.filter(
      (emailItem) =>
        !emailItem.isSnoozed ||
        (emailItem.snoozeUntil && new Date(emailItem.snoozeUntil) < now),
    );

    const threadIds = unsnoozed
      .map((emailItem) => emailItem.threadId)
      .filter(Boolean);
    const pendingDueAt = await this.fetchPendingFollowUpDueAt(
      userId,
      threadIds,
    );

    const user = await this.usersService.findOne(userId);
    if (!user) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    const userEmail = EncryptionHelper.tryDecrypt(user.email);

    const result: InboxEmail[] = [];
    for (const email of unsnoozed) {
      const matched = await this.evaluateFollowUpCandidate(userId, email, {
        userEmail,
        dueAt: pendingDueAt.get(email.threadId),
        now,
      });
      if (matched) result.push(email);
    }
    end();
    return result;
  }

  private logSnoozeMismatchDebug(emails: InboxEmail[], now: Date): void {
    // Debug: log threads that passed the SQL snooze filter but still have isSnoozed
    // set on the email record — this would indicate thread vs email snooze mismatch.
    for (const emailItem of emails) {
      if (
        emailItem.isSnoozed &&
        emailItem.snoozeUntil &&
        new Date(emailItem.snoozeUntil) > now
      ) {
        this.logger.warn(
          `[DEBUG #2125] Thread ${emailItem.threadId} reached follow-up filter` +
            ` but email.isSnoozed=true (snoozeUntil=${new Date(emailItem.snoozeUntil).toISOString()}).` +
            ` Thread-level snooze was cleared but email-level snooze was not.`,
        );
      }
    }
  }

  private async fetchPendingFollowUpDueAt(
    userId: string,
    threadIds: string[],
  ): Promise<Map<string, Date>> {
    const pendingDueAt = new Map<string, Date>();
    if (!threadIds.length) return pendingDueAt;

    const activeFollowUps = await this.followUpRepository
      .createQueryBuilder("fu")
      .where("fu.userId = :userId", { userId })
      .andWhere("fu.threadId IN (:...threadIds)", { threadIds })
      .andWhere("fu.status IN (:...statuses)", {
        statuses: [FollowUpStatus.AWAITING_REPLY, FollowUpStatus.FOLLOW_UP_DUE],
      })
      .getMany();

    for (const followUp of activeFollowUps) {
      const existing = pendingDueAt.get(followUp.threadId);
      if (!existing || followUp.followUpDueAt < existing) {
        pendingDueAt.set(followUp.threadId, followUp.followUpDueAt);
      }
    }
    return pendingDueAt;
  }

  private async evaluateFollowUpCandidate(
    userId: string,
    email: InboxEmail,
    ctx: { userEmail: string; dueAt: Date | undefined; now: Date },
  ): Promise<boolean> {
    try {
      const status = await this.computeThreadFollowUpStatus(
        userId,
        email.threadId,
        ctx.userEmail,
      );

      if (status.userSentLast && !status.replyReceived) {
        this.logFollowUpCandidateDebug(email, status, ctx.dueAt, ctx.now);
        email.lastTheirReplyAt = status.lastTheirReplyAt?.toISOString();
        email.lastMyReplyAt = status.lastMyReplyAt?.toISOString();
        email.followUpDueAt = ctx.dueAt?.toISOString();
        return true;
      }
      return false;
    } catch (error) {
      this.logger.warn(
        `Failed to check follow-up status for thread ${email.threadId}:`,
        error,
      );
      return false;
    }
  }

  private logFollowUpCandidateDebug(
    email: InboxEmail,
    status: {
      lastMyReplyAt: Date | null;
      lastTheirReplyAt: Date | null;
    },
    dueAt: Date | undefined,
    now: Date,
  ): void {
    const myReply = status.lastMyReplyAt?.toISOString() ?? "null";
    const theirReply = status.lastTheirReplyAt?.toISOString() ?? "null";

    if (dueAt && dueAt > now) {
      this.logger.warn(
        `[DEBUG #2125] Thread ${email.threadId} is appearing in follow-up mode` +
          ` but follow-up is not yet due (dueAt=${dueAt.toISOString()},` +
          ` lastMyReplyAt=${myReply}, lastTheirReplyAt=${theirReply}).` +
          ` Expected: thread should still be snoozed until ~${dueAt.toISOString()}.`,
      );
    } else if (dueAt) {
      this.logger.debug(
        `[DEBUG #2125] Thread ${email.threadId} in follow-up - follow-up is due` +
          ` (dueAt=${dueAt.toISOString()}, lastMyReplyAt=${myReply})`,
      );
    } else {
      this.logger.debug(
        `[DEBUG #2125] Thread ${email.threadId} in follow-up - no scheduled follow-up record` +
          ` (lastMyReplyAt=${myReply}, lastTheirReplyAt=${theirReply})`,
      );
    }
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
    return this.computeThreadFollowUpStatus(userId, threadId, userEmail);
  }

  private async computeThreadFollowUpStatus(
    userId: string,
    threadId: string,
    userEmail: string,
  ): Promise<{
    userSentLast: boolean;
    replyReceived: boolean;
    lastTheirReplyAt: Date | null;
    lastMyReplyAt: Date | null;
  }> {
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

      // BearlyMail controls all auto-responder sends and always sets sentByAutoResponder=true
      // on the Email entity (either at creation time or via upsert if sync raced ahead).
      // No fuzzy/grace-period fallback is needed.
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
