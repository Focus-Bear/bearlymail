import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { Repository } from "typeorm";

import { CloudWatchService } from "../aws/cloudwatch.service";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";
import { Email } from "../database/entities/email.entity";
import { User } from "../database/entities/user.entity";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { StructuralError } from "../errors/structural-error";
import { LLMService } from "../llm/llm.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { UsersService } from "../users/users.service";
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

interface FollowUpContext {
  recipientName: string;
  daysSinceLastEmail: number;
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
    @Inject("PG_BOSS") private boss: PgBoss,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    private suggestedRepliesService: SuggestedRepliesService,
    private llmService: LLMService,
    private usersService: UsersService,
    private cloudWatchService: CloudWatchService,
  ) {}

  async onModuleInit() {
    this.logger.log("Registering generate-suggested-replies worker");

    await this.boss.work(
      "generate-suggested-replies",
      { teamSize: 4 },
      (job: PgBoss.Job<object>) => this.handleGenerateSuggestedRepliesJob(job),
    );

    this.logger.log(
      "generate-suggested-replies worker registered successfully",
    );
  }

  private async handleGenerateSuggestedRepliesJob(
    job: PgBoss.Job<object>,
  ): Promise<unknown> {
    const { userId, threadId, emailId } = job.data as {
      userId: string;
      threadId: string;
      emailId: string;
    };
    const workerId = job.id || "unknown";
    const tracker = new JobPerformanceTracker(
      "generate-suggested-replies",
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
    const userEmail = EncryptionHelper.decrypt(user.email)?.toLowerCase() ?? "";
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
      userName: user?.displayName || user?.name || "User",
      userJobTitle: user?.jobTitle || "",
      emailExamples,
      // Expose booking link (if configured) to prompts so the LLM can include it
      calendarLink: user?.calendarBookingUrl || null,
    };

    return { userEmail, userSentLast, userContext, emailExamples };
  }

  private async buildFollowUpContext(
    threadId: string,
    userId: string,
    userEmail: string,
    latestEmail: Email,
  ): Promise<FollowUpContext> {
    const threadEmails = await this.emailRepository.find({
      where: { emailThreadId: threadId, userId },
      order: { receivedAt: "ASC" },
      take: 5,
    });

    const recipientName =
      threadEmails.find(
        (emailEntry) => emailEntry.from?.toLowerCase() !== userEmail,
      )?.fromName || "there";

    const now = new Date();
    const daysSinceLastEmail = Math.floor(
      (now.getTime() - new Date(latestEmail.receivedAt).getTime()) /
        MILLISECONDS.DAY,
    );

    const threadMessages = threadEmails.map((emailEntry) => ({
      from: emailEntry.from || "",
      fromName: emailEntry.fromName || undefined,
      body: emailEntry.body || "",
      receivedAt: emailEntry.receivedAt,
      isFromUser: emailEntry.from?.toLowerCase() === userEmail,
    }));

    return { recipientName, daysSinceLastEmail, threadMessages };
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
        latestEmail,
      );

      const followUpText = await this.llmService.generateFollowUpDraft(
        latestEmail.subject || "",
        followUpCtx.threadMessages,
        followUpCtx.recipientName,
        Math.max(1, followUpCtx.daysSinceLastEmail),
        {
          tone: userContext.tone,
          commonPhrases: emailExamples,
        },
        undefined,
        userId,
      );

      return [{ label: "Follow Up", text: followUpText }];
    }

    return this.llmService.generateReplyOptions(
      {
        from: latestEmail.from || "",
        fromName: latestEmail.fromName || undefined,
        subject: latestEmail.subject || "",
        body: latestEmail.body || "",
      },
      userContext,
      undefined,
      userId,
    );
  }
}
