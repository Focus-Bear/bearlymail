import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import type { Job, PgBoss } from "pg-boss";
import { Repository } from "typeorm";

import { ERROR_MESSAGES } from "../constants/error-messages";
import { INJECT_TOKENS } from "../constants/inject-tokens";
import { JOB_NAMES } from "../constants/job-names";
import { THREAD_LIMITS } from "../constants/llm-constants";
import { HTTP_STATUS } from "../constants/service-constants";
import { MS_PER_SECOND } from "../constants/time-constants";
import { ContextService } from "../context/context.service";
import { Email } from "../database/entities/email.entity";
import {
  FollowUp,
  FollowUpStatus,
} from "../database/entities/follow-up.entity";
import { User } from "../database/entities/user.entity";
import { ContextKey } from "../database/entities/user-context.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { UserEncryptionService } from "../encryption/user-encryption.service";
import { LLMService } from "../llm/llm.service";
import { registerWorker } from "../queue/register-worker";
import { UsersService } from "../users/users.service";
import { calculateBusinessDays } from "../utils/business-days.util";
import { deriveRecipientDisplayName } from "../utils/email-address.utils";
import { analyzeThreadStyle } from "../utils/thread-style-extractor";
import { FollowUpsService } from "./follow-ups.service";

type ThreadMessage = {
  from: string;
  fromName?: string;
  to?: string;
  body: string;
  receivedAt: Date;
  isFromUser: boolean;
};

type FollowUpContext = {
  user: User;
  userEmail: string;
  threadMessages: ThreadMessage[];
  theirName: string;
  businessDaysWaiting: number;
  userCommunicationStyle: { tone?: string; commonPhrases?: string[] };
  threadStyleInfo: ReturnType<typeof analyzeThreadStyle>;
};

@Injectable()
export class FollowUpsProcessor implements OnModuleInit {
  private readonly logger = new Logger(FollowUpsProcessor.name);

  constructor(
    @Inject(INJECT_TOKENS.PG_BOSS) private boss: PgBoss,
    @InjectRepository(FollowUp)
    private followUpRepository: Repository<FollowUp>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @Inject(forwardRef(() => FollowUpsService))
    private followUpsService: FollowUpsService,
    private llmService: LLMService,
    private contextService: ContextService,
    private usersService: UsersService,
    private emailProviderManager: EmailProviderManager,
    private readonly userEncryptionService: UserEncryptionService,
  ) {}

  async onModuleInit() {
    this.logger.log("Registering generate-follow-up-draft worker");
    await registerWorker(
      this.boss,
      JOB_NAMES.GENERATE_FOLLOW_UP_DRAFT,
      async (job) => {
        // Wrap in the user's KMS key context: these handlers read per-user-
        // encrypted Email/FollowUp rows (and the error paths re-read them), which
        // fail (and previously crashed the worker) without the per-user key.
        const { userId } = (job.data ?? {}) as { userId?: string };
        if (!userId) {
          throw new Error(
            "Cannot generate follow-up draft: missing userId in job data",
          );
        }
        await this.userEncryptionService.withUserKey(userId, () =>
          this.handleGenerateFollowUpDraftJob(job as Job),
        );
      },
    );

    this.logger.log("Registering bulk-send-follow-ups worker");
    await registerWorker(
      this.boss,
      JOB_NAMES.BULK_SEND_FOLLOW_UPS,
      async (job) => {
        const { userId } = (job.data ?? {}) as { userId?: string };
        if (!userId) {
          throw new Error(
            "Cannot bulk send follow-ups: missing userId in job data",
          );
        }
        await this.userEncryptionService.withUserKey(userId, () =>
          this.handleBulkSendFollowUpsJob(job as Job),
        );
      },
    );

    this.logger.log("Follow-ups processor initialized");
  }

  /**
   * Gather all data needed to generate a follow-up draft:
   * user info, thread messages (decrypted), communication style, thread style analysis.
   */
  private async buildFollowUpContext(
    userId: string,
    threadId: string,
  ): Promise<FollowUpContext> {
    const user = await this.usersService.findOne(userId);
    if (!user) throw new Error(ERROR_MESSAGES.USER_NOT_FOUND);
    const userEmail = EncryptionHelper.tryDecrypt(user.email);

    const threadEmails = await this.emailRepository.find({
      where: { userId, threadId },
      order: { receivedAt: "ASC" },
    });
    if (threadEmails.length === 0) throw new Error("No emails found in thread");

    const lastMessages = threadEmails.slice(-THREAD_LIMITS.LAST_MESSAGES);
    const threadMessages: ThreadMessage[] = await Promise.all(
      lastMessages.map(async (email) => {
        const isFromUser =
          email.labels?.includes("SENT") ||
          (EncryptionHelper.tryDecrypt(email.from) ?? "").toLowerCase() ===
            (userEmail ?? "").toLowerCase();
        return {
          from: EncryptionHelper.tryDecrypt(email.from),
          fromName: email.fromName
            ? EncryptionHelper.tryDecrypt(email.fromName)
            : undefined,
          to: email.to ? EncryptionHelper.tryDecrypt(email.to) : undefined,
          body: EncryptionHelper.tryDecrypt(email.body),
          receivedAt: email.receivedAt,
          isFromUser,
        };
      }),
    );

    const lastUserMessage = threadMessages
      .filter((message) => message.isFromUser)
      .sort(
        (itemA, itemB) =>
          itemB.receivedAt.getTime() - itemA.receivedAt.getTime(),
      )[0];
    if (!lastUserMessage) throw new Error("No user message found in thread");

    const businessDaysWaiting = calculateBusinessDays(
      lastUserMessage.receivedAt,
      new Date(),
    );

    const contexts = await this.contextService.getUserContext(userId);
    const tone = contexts.find(
      (item) => item.contextKey === ContextKey.WRITING_STYLE_TONE,
    )?.contextValue;
    const commonPhrases = contexts
      .filter((item) => item.contextKey === ContextKey.COMMON_PHRASE)
      .map((item) => EncryptionHelper.tryDecrypt(item.contextValue));

    const recipientMessages = threadMessages
      .filter((message) => !message.isFromUser)
      .sort(
        (itemA, itemB) =>
          itemB.receivedAt.getTime() - itemA.receivedAt.getTime(),
      );

    const lastTheirMessage = recipientMessages[0];
    // If the other party hasn't replied yet, there's no "their message" to pull a
    // name from — fall back to who the user actually addressed their last message
    // to, rather than a generic placeholder the LLM will otherwise turn into a
    // hallucinated greeting (e.g. "Hi Team,").
    const theirName =
      lastTheirMessage?.fromName ||
      lastTheirMessage?.from ||
      deriveRecipientDisplayName(lastUserMessage.to) ||
      "there";

    const userDisplayName = user.displayName
      ? EncryptionHelper.tryDecrypt(user.displayName)
      : undefined;
    const threadStyleInfo = analyzeThreadStyle(
      recipientMessages,
      userDisplayName,
    );

    return {
      user,
      userEmail,
      threadMessages,
      theirName,
      businessDaysWaiting,
      userCommunicationStyle: {
        tone,
        commonPhrases: commonPhrases.length > 0 ? commonPhrases : undefined,
      },
      threadStyleInfo,
    };
  }

  /** Record a generation failure on the FollowUp entity without throwing. */
  private async recordFollowUpGenerationError(
    userId: string,
    followUpId: string,
    error: unknown,
  ): Promise<void> {
    try {
      const followUp = await this.followUpRepository.findOne({
        where: { id: followUpId, userId },
      });
      if (followUp) {
        followUp.generationStatus = "error";
        followUp.generationError =
          error instanceof Error ? error.message : String(error);
        await this.followUpRepository.save(followUp);
      }
    } catch (saveError) {
      this.logger.error(
        `Failed to save error state for follow-up ${followUpId}:`,
        saveError,
      );
    }
  }

  /** Record a send failure on the FollowUp entity without throwing. */
  private async recordFollowUpSendError(
    userId: string,
    followUpId: string,
    error: unknown,
  ): Promise<void> {
    try {
      const followUp = await this.followUpRepository.findOne({
        where: { id: followUpId, userId },
      });
      if (followUp) {
        followUp.sendStatus = "failed";
        followUp.sendError =
          error instanceof Error ? error.message : String(error);
        await this.followUpRepository.save(followUp);
      }
    } catch (saveError) {
      this.logger.error(
        `Failed to save error state for follow-up ${followUpId}:`,
        saveError,
      );
    }
  }

  private async handleGenerateFollowUpDraftJob(job: Job) {
    const { userId, followUpId, threadId } = job.data as {
      userId: string;
      followUpId: string;
      threadId: string;
    };
    const workerId = job.id || "unknown";
    this.logger.log(
      `[Worker ${workerId}] Starting follow-up draft generation for followUp ${followUpId}, thread ${threadId}`,
    );

    try {
      const followUp = await this.followUpRepository.findOne({
        where: { id: followUpId, userId },
      });

      if (!followUp) {
        this.logger.warn(`Follow-up ${followUpId} not found`);
        return;
      }

      if (followUp.draftFollowUp) {
        this.logger.log(`Follow-up ${followUpId} already has draft, skipping`);
        return;
      }

      followUp.generationStatus = "generating";
      followUp.generationError = null;
      await this.followUpRepository.save(followUp);

      const ctx = await this.buildFollowUpContext(userId, threadId);

      this.logger.debug(
        `Thread style analysis for follow-up ${followUpId}: hasPreferredName=${!!ctx.threadStyleInfo.preferredName}, greetingStyle=${ctx.threadStyleInfo.greetingStyle}`,
      );

      const draft = await this.llmService.generateFollowUpDraft({
        subject: followUp.subject || "Follow up",
        threadMessages: ctx.threadMessages,
        theirName: ctx.theirName,
        businessDaysWaiting: ctx.businessDaysWaiting,
        userCommunicationStyle: ctx.userCommunicationStyle,
        userId,
        threadStyleInfo: ctx.threadStyleInfo,
      });

      followUp.draftFollowUp = draft;
      followUp.generationStatus = "completed";
      followUp.generatedAt = new Date();
      followUp.generationError = null;
      await this.followUpRepository.save(followUp);

      this.logger.log(
        `[Worker ${workerId}] Successfully generated draft for follow-up ${followUpId}`,
      );
    } catch (error) {
      this.logger.error(
        `[Worker ${workerId}] Error generating follow-up draft for ${followUpId}:`,
        error,
      );
      await this.recordFollowUpGenerationError(userId, followUpId, error);
    }
  }

  private async sendFollowUpWithRetry(
    userId: string,
    followUp: FollowUp,
    draft: string,
    recipient: string,
    subject: string,
  ): Promise<void> {
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) throw new Error(ERROR_MESSAGES.NO_EMAIL_PROVIDER);

    const maxRetries = 3;
    let retries = 0;
    let lastError: Error | null = null;

    while (retries < maxRetries) {
      try {
        await provider.sendReply(userId, {
          threadId: followUp.threadId,
          to: recipient,
          subject,
          body: draft,
        });
        return;
      } catch (error: unknown) {
        lastError = error as Error;
        const apiError = error as {
          code?: number;
          response?: { status?: number };
        };
        if (
          apiError.code === HTTP_STATUS.TOO_MANY_REQUESTS ||
          apiError.response?.status === HTTP_STATUS.TOO_MANY_REQUESTS
        ) {
          retries++;
          if (retries < maxRetries) {
            const backoffSeconds = Math.pow(2, retries);
            this.logger.warn(
              `Rate limit hit for follow-up ${followUp.id}, retrying in ${backoffSeconds}s (attempt ${retries}/${maxRetries})`,
            );
            await new Promise((resolve) =>
              setTimeout(resolve, backoffSeconds * MS_PER_SECOND),
            );
            continue;
          }
        } else {
          throw error;
        }
      }
    }

    if (lastError) throw lastError;
  }

  /**
   * Process a single follow-up within the bulk-send job.
   * Returns a result object (success/failure) — never throws.
   */
  private async sendSingleFollowUp(
    userId: string,
    followUpId: string,
  ): Promise<{ followUpId: string; success: boolean; error?: string }> {
    try {
      const followUp = await this.followUpRepository.findOne({
        where: { id: followUpId, userId },
      });

      if (!followUp) {
        return {
          followUpId,
          success: false,
          error: ERROR_MESSAGES.FOLLOW_UP_NOT_FOUND,
        };
      }
      if (!followUp.draftFollowUp) {
        return { followUpId, success: false, error: "No draft available" };
      }

      followUp.sendStatus = "sending";
      followUp.sendError = null;
      await this.followUpRepository.save(followUp);

      const threadEmails = await this.emailRepository.find({
        where: { userId, threadId: followUp.threadId },
        order: { receivedAt: "DESC" },
        take: 1,
      });

      if (threadEmails.length === 0)
        throw new Error(ERROR_MESSAGES.THREAD_NOT_FOUND);

      const lastEmail = threadEmails[0];
      const recipient = EncryptionHelper.tryDecrypt(lastEmail.from);
      const rawSubject =
        followUp.subject ||
        EncryptionHelper.tryDecrypt(lastEmail.subject) ||
        "Follow up";
      const subject = rawSubject.toLowerCase().startsWith("re:")
        ? rawSubject
        : `Re: ${rawSubject}`;

      const draft = EncryptionHelper.tryDecrypt(followUp.draftFollowUp);
      await this.sendFollowUpWithRetry(
        userId,
        followUp,
        draft,
        recipient,
        subject,
      );

      followUp.sendStatus = "sent";
      followUp.status = FollowUpStatus.COMPLETED;
      await this.followUpRepository.save(followUp);

      return { followUpId, success: true };
    } catch (error) {
      this.logger.error(`Error sending follow-up ${followUpId}:`, error);
      await this.recordFollowUpSendError(userId, followUpId, error);
      return {
        followUpId,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async handleBulkSendFollowUpsJob(job: Job) {
    const { userId, followUpIds } = job.data as {
      userId: string;
      followUpIds: string[];
    };
    const workerId = job.id || "unknown";
    this.logger.log(
      `[Worker ${workerId}] Starting bulk send for ${followUpIds.length} follow-ups`,
    );

    const results = await Promise.all(
      followUpIds.map((followUpId) =>
        this.sendSingleFollowUp(userId, followUpId),
      ),
    );

    this.logger.log(
      `[Worker ${workerId}] Bulk send completed: ${results.filter((result) => result.success).length}/${results.length} succeeded`,
    );

    return results;
  }
}
