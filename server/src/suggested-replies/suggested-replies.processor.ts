import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Job, PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { StructuralError } from "../errors/structural-error";
import { LLMService } from "../llm/llm.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { registerWorker } from "../queue/register-worker";
import { UsersService } from "../users/users.service";
import {
  normalizeEncryptedUserText,
  resolveUserDisplayName,
  resolveUserJobTitle,
} from "../utils/user-display-fields.util";
import { SuggestedRepliesService } from "./suggested-replies.service";

interface ReplyContext {
  userEmail: string;
  userSentLast: boolean;
  userContext: {
    tone: string;
    userName: string;
    userJobTitle: string;
    emailExamples: string[];
    // Optional booking link to include in scheduling replies when available
    calendarLink?: string | null;
  };
  emailExamples: string[];
}

const FOLLOW_UP_THREAD_WINDOW = 10;

interface FollowUpContext {
  recipientName: string;
  daysSinceLastEmail: number;
  lastOtherPartyMessage: string;
  userLastMessage: string;
  threadMessages: Array<{
    from: string;
    fromName: string | undefined;
    body: string;
    receivedAt: Date;
    isFromUser: boolean;
  }>;
}

@Injectable()
export class SuggestedRepliesProcessor implements OnModuleInit {
  private readonly logger = new Logger(SuggestedRepliesProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private suggestedRepliesService: SuggestedRepliesService,
    private llmService: LLMService,
    private usersService: UsersService,
    private cloudWatchService: CloudWatchService,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    this.logger.log("Registering generate-suggested-replies worker");

    await registerWorker(
      this.boss,
      JOB_NAMES.GENERATE_SUGGESTED_REPLIES,
      { teamSize: 4 },
      (job: Job<object>) => {
        // Wrap in the user's KMS key context: this handler reads per-user-
        // encrypted Email rows, which fail (and previously crashed the worker)
        // without the per-user key.
        const { userId } = (job.data ?? {}) as { userId?: string };
        if (!userId) {
          throw new Error(
            "Cannot generate suggested replies: missing userId in job data",
          );
        }
        return this.userEncryptionService.withUserKey(userId, () =>
          this.handleGenerateSuggestedRepliesJob(job),
        );
      },
    );

    this.logger.log(
      "generate-suggested-replies worker registered successfully",
    );
  }

  private async handleGenerateSuggestedRepliesJob(
    job: Job<object>,
  ): Promise<unknown> {
    const { userId, threadId, emailId } = job.data as {
      userId: string;
      threadId: string;
      emailId: string;
    };
    const workerId = job.id || "unknown";
    const tracker = new JobPerformanceTracker(
      JOB_NAMES.GENERATE_SUGGESTED_REPLIES,
      workerId,
      this.cloudWatchService,
    );
    tracker.setMetadata({ userId, threadId, emailId });

    this.logger.log(
      `[Worker ${workerId}] Starting suggested reply generation for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...`,
    );

    try {
      tracker.startPhase("dataFetch");

      const user = await this.fetchUserWithSettings(userId);
      if (!user) {
        this.logger.warn(`[Worker ${workerId}] User ${userId} not found`);
        return;
      }

      const latestEmailInThread = await this.fetchLatestEmailInThread(
        threadId,
        userId,
      );
      if (!latestEmailInThread) {
        this.logger.warn(
          `[Worker ${workerId}] No emails found in thread ${threadId} for user ${userId}`,
        );
        return;
      }

      const replyContext = this.buildReplyContext(user, latestEmailInThread);

      await this.suggestedRepliesService.markAsGenerating(userId, threadId);

      tracker.endPhase("dataFetch");
      tracker.startPhase("llmCall");

      const options = await this.generateReplySuggestions(
        workerId,
        threadId,
        userId,
        replyContext,
        latestEmailInThread,
      );

      tracker.endPhase("llmCall");
      tracker.startPhase("dbUpdate");

      await this.suggestedRepliesService.saveSuggestedReplies(
        userId,
        threadId,
        options,
        latestEmailInThread.id,
      );

      tracker.endPhase("dbUpdate");
      tracker.finish();

      this.logger.log(
        `[Worker ${workerId}] Generated ${options.length} suggested replies for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...`,
      );
    } catch (error) {
      return this.handleJobError(error, workerId, userId, threadId, tracker);
    }
  }

  private async handleJobError(
    error: unknown,
    workerId: string,
    userId: string,
    threadId: string,
    tracker: JobPerformanceTracker,
  ): Promise<unknown> {
    // Check if this is a structural error (missing prompts, config issues, etc.)
    if (StructuralError.isStructuralError(error)) {
      this.logger.error(
        `[STRUCTURAL ERROR - NO RETRY] [Worker ${workerId}] Suggested replies job failed for thread ${threadId}: ${(error as Error).message}`,
      );
      await this.suggestedRepliesService.markAsNotGenerating(userId, threadId);
      tracker.finish(error as Error);
      // Return error object instead of throwing to prevent retries
      return {
        error: "StructuralError",
        message: (error as Error).message,
        threadId,
      };
    }

    this.logger.error(
      `[Worker ${workerId}] Failed to generate suggested replies for thread ${threadId}`,
      error,
    );

    await this.suggestedRepliesService.markAsNotGenerating(userId, threadId);

    tracker.finish(error as Error);
    throw error;
  }

  private async fetchUserWithSettings(userId: string): Promise<User | null> {
    return this.usersService.findOne(userId);
  }

  private async fetchLatestEmailInThread(
    threadId: string,
    userId: string,
  ): Promise<Email | null> {
    return this.emailRepository.findOne({
      where: { emailThreadId: threadId, userId },
      order: { receivedAt: "DESC" },
    });
  }

  private buildReplyContext(user: User, latestEmail: Email): ReplyContext {
    const userEmail =
      EncryptionHelper.tryDecrypt(user.email)?.toLowerCase() ?? "";
    const lastEmailFrom = latestEmail.from?.toLowerCase() || "";
    const userSentLast = Boolean(userEmail && lastEmailFrom === userEmail);

    const toneRules = user?.toneSettings?.rules || [];
    const emailExamples = toneRules.filter(
      (rule: string) =>
        !rule.startsWith("Tone:") &&
        !rule.startsWith("Style:") &&
        !rule.startsWith("Common phrase:"),
    );

    const userContext = {
      tone: "professional",
      userName: resolveUserDisplayName(user),
      userJobTitle: resolveUserJobTitle(user),
      emailExamples,
      // Expose booking link (if configured) to prompts so the LLM can include it
      calendarLink:
        normalizeEncryptedUserText(user?.calendarBookingUrl) || null,
    };

    return { userEmail, userSentLast, userContext, emailExamples };
  }

  private async buildFollowUpContext(
    threadId: string,
    userId: string,
    userEmail: string,
  ): Promise<FollowUpContext> {
    // Fetch more messages (10 instead of 5) to capture other party's last reply
    // in long threads where the user has sent multiple follow-ups.
    const threadEmails = await this.emailRepository.find({
      where: { emailThreadId: threadId, userId },
      order: { receivedAt: "ASC" },
      take: FOLLOW_UP_THREAD_WINDOW,
    });

    // Find the most recent email from the OTHER party — this is what we're following up on.
    const otherPartyEmails = threadEmails.filter(
      (email) => email.from?.toLowerCase() !== userEmail,
    );
    const lastOtherPartyEmail =
      otherPartyEmails.length > 0
        ? otherPartyEmails[otherPartyEmails.length - 1]
        : null;

    const recipientName = lastOtherPartyEmail?.fromName || "there";

    // Measure wait time from when the OTHER party last replied, not from the user's email.
    const now = new Date();
    const referenceDate = lastOtherPartyEmail
      ? new Date(lastOtherPartyEmail.receivedAt)
      : now;
    const daysSinceLastEmail = Math.floor(
      (now.getTime() - referenceDate.getTime()) / MILLISECONDS.DAY,
    );

    // Extract message bodies for the enriched prompt context.
    const lastOtherPartyMessage = lastOtherPartyEmail?.body || "";
    const userEmails = threadEmails.filter(
      (email) => email.from?.toLowerCase() === userEmail,
    );
    const lastUserEmail =
      userEmails.length > 0 ? userEmails[userEmails.length - 1] : null;
    const userLastMessage = lastUserEmail?.body || "";

    const threadMessages = threadEmails.map((emailEntry) => ({
      from: emailEntry.from || "",
      fromName: emailEntry.fromName || undefined,
      body: emailEntry.body || "",
      receivedAt: emailEntry.receivedAt,
      isFromUser: emailEntry.from?.toLowerCase() === userEmail,
    }));

    return {
      recipientName,
      daysSinceLastEmail,
      lastOtherPartyMessage,
      userLastMessage,
      threadMessages,
    };
  }

  private async generateReplySuggestions(
    workerId: string,
    threadId: string,
    userId: string,
    replyContext: ReplyContext,
    latestEmail: Email,
  ): Promise<Array<{ label: string; text: string }>> {
    const { userEmail, userSentLast, userContext, emailExamples } =
      replyContext;

    if (userSentLast) {
      this.logger.log(
        `[Worker ${workerId}] User sent last email - generating follow-up suggestion for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...`,
      );

      const followUpCtx = await this.buildFollowUpContext(
        threadId,
        userId,
        userEmail,
      );

      const followUpText = await this.llmService.generateFollowUpDraft({
        subject: latestEmail.subject || "",
        threadMessages: followUpCtx.threadMessages,
        theirName: followUpCtx.recipientName,
        businessDaysWaiting: Math.max(1, followUpCtx.daysSinceLastEmail),
        userCommunicationStyle: {
          tone: userContext.tone,
          commonPhrases: emailExamples,
        },
        userId,
        calendarBookingUrl: userContext.calendarLink,
        lastOtherPartyMessage: followUpCtx.lastOtherPartyMessage,
        userLastMessage: followUpCtx.userLastMessage,
      });

      return [{ label: "Follow Up", text: followUpText }];
    }

    // Fetch the 5 most recent prior thread messages so the LLM can take the
    // conversation history into account when generating reply options (fixes #885).
    // Fetched newest-first (DESC) so `take: 5` captures recency, then reversed
    // to chronological order for the prompt. The current email is excluded to
    // avoid duplicating it in the AI prompt alongside the main email body.
    const recentThreadEmails = await this.emailRepository.find({
      where: { emailThreadId: threadId, userId },
      order: { receivedAt: "DESC" },
      take: 5,
    });

    const threadMessages = recentThreadEmails
      .filter((emailEntry) => emailEntry.id !== latestEmail.id)
      .reverse()
      .map((emailEntry) => ({
        from: emailEntry.from || "",
        fromName: emailEntry.fromName || undefined,
        body: emailEntry.body || "",
        receivedAt: emailEntry.receivedAt,
        isFromUser: emailEntry.from?.toLowerCase() === userEmail,
      }));

    return this.llmService.generateReplyOptions(
      {
        from: latestEmail.from || "",
        fromName: latestEmail.fromName || undefined,
        subject: latestEmail.subject || "",
        // Use compact summary to reduce token usage on downstream prompts.
        // Falls back to raw body if summary is not yet available.
        body: latestEmail.summary ?? latestEmail.body ?? "",
      },
      userContext,
      undefined,
      userId,
      threadMessages,
    );
  }
}
