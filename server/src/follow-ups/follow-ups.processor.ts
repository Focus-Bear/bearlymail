import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import PgBoss from "pg-boss";
import { Repository } from "typeorm";

import { THREAD_LIMITS } from "../constants/llm-constants";
import { HTTP_STATUS } from "../constants/service-constants";
import { MS_PER_SECOND } from "../constants/time-constants";
import { ContextService } from "../context/context.service";
import { Email } from "../database/entities/email.entity";
import {
  FollowUp,
  FollowUpStatus,
} from "../database/entities/follow-up.entity";
import { ContextKey } from "../database/entities/user-context.entity";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { calculateBusinessDays } from "../utils/business-days.util";
import { analyzeThreadStyle } from "../utils/thread-style-extractor";
import { FollowUpsService } from "./follow-ups.service";

@Injectable()
export class FollowUpsProcessor implements OnModuleInit {
  private readonly logger = new Logger(FollowUpsProcessor.name);

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
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
  ) {}

  async onModuleInit() {
    this.logger.log("Registering generate-follow-up-draft worker");
    await this.boss.work("generate-follow-up-draft", async (job) => {
      await this.handleGenerateFollowUpDraftJob(job as PgBoss.Job);
    });

    this.logger.log("Registering bulk-send-follow-ups worker");
    await this.boss.work("bulk-send-follow-ups", async (job) =>
      this.handleBulkSendFollowUpsJob(job as PgBoss.Job),
    );

    this.logger.log("Follow-ups processor initialized");
  }

  private async handleGenerateFollowUpDraftJob(job: PgBoss.Job) {
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

      const user = await this.usersService.findOne(userId);
      if (!user) throw new Error("User not found");
      const userEmail = EncryptionHelper.decrypt(user.email);

      const threadEmails = await this.emailRepository.find({
        where: { userId, threadId },
        order: { receivedAt: "ASC" },
      });

      if (threadEmails.length === 0)
        throw new Error("No emails found in thread");

      const lastMessages = threadEmails.slice(-THREAD_LIMITS.LAST_MESSAGES);
      const threadMessages = await Promise.all(
        lastMessages.map(async (email) => {
          const isFromUser =
            email.labels?.includes("SENT") ||
            EncryptionHelper.decrypt(email.from).toLowerCase() ===
              userEmail.toLowerCase();

          return {
            from: EncryptionHelper.decrypt(email.from),
            fromName: email.fromName
              ? EncryptionHelper.decrypt(email.fromName)
              : undefined,
            body: EncryptionHelper.decrypt(email.body),
            receivedAt: email.receivedAt,
            isFromUser,
          };
        }),
      );

      const lastUserMessage = threadMessages
        .filter((message) => message.isFromUser)
        .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];

      if (!lastUserMessage) throw new Error("No user message found in thread");

      const now = new Date();
      const businessDaysWaiting = calculateBusinessDays(
        lastUserMessage.receivedAt,
        now,
      );

      const contexts = await this.contextService.getUserContext(userId);
      const tone = contexts.find(
        (c) => c.contextKey === ContextKey.WRITING_STYLE_TONE,
      )?.contextValue;
      const commonPhrases = contexts
        .filter((c) => c.contextKey === ContextKey.COMMON_PHRASE)
        .map((c) => EncryptionHelper.decrypt(c.contextValue));

      const userCommunicationStyle = {
        tone,
        commonPhrases: commonPhrases.length > 0 ? commonPhrases : undefined,
      };

      // Analyze thread style to extract preferred name and greeting style
      // This helps make follow-ups sound more natural by matching the recipient's style
      const recipientMessages = threadMessages
        .filter((message) => !message.isFromUser)
        .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

      // Get recipient name (formal name from email headers)
      const lastTheirMessage = recipientMessages[0];
      const theirName =
        lastTheirMessage?.fromName || lastTheirMessage?.from || "there";

      // Get user's display name to help detect greeting patterns
      const userDisplayName = user.displayName
        ? EncryptionHelper.decrypt(user.displayName)
        : undefined;

      const threadStyleInfo = analyzeThreadStyle(
        recipientMessages,
        userDisplayName,
      );

      this.logger.debug(
        `Thread style analysis for follow-up ${followUpId}: hasPreferredName=${!!threadStyleInfo.preferredName}, greetingStyle=${threadStyleInfo.greetingStyle}`,
      );

      const draft = await this.llmService.generateFollowUpDraft(
        followUp.subject || "Follow up",
        threadMessages,
        theirName,
        businessDaysWaiting,
        userCommunicationStyle,
        undefined,
        userId,
        threadStyleInfo,
      );

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
  }

  private async sendFollowUpWithRetry(
    userId: string,
    followUp: FollowUp,
    draft: string,
    recipient: string,
    subject: string,
  ): Promise<void> {
    const provider = await this.emailProviderManager.getPrimaryProvider(userId);
    if (!provider) throw new Error("No email provider connected");

    const maxRetries = 3;
    let retries = 0;
    let lastError: Error | null = null;

    while (retries < maxRetries) {
      try {
        await provider.sendReply(
          userId,
          followUp.threadId,
          recipient,
          subject,
          draft,
        );
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

  private async handleBulkSendFollowUpsJob(job: PgBoss.Job) {
    const { userId, followUpIds } = job.data as {
      userId: string;
      followUpIds: string[];
    };
    const workerId = job.id || "unknown";
    this.logger.log(
      `[Worker ${workerId}] Starting bulk send for ${followUpIds.length} follow-ups`,
    );

    const results: Array<{
      followUpId: string;
      success: boolean;
      error?: string;
    }> = [];

    for (const followUpId of followUpIds) {
      try {
        const followUp = await this.followUpRepository.findOne({
          where: { id: followUpId, userId },
        });

        if (!followUp) {
          results.push({
            followUpId,
            success: false,
            error: "Follow-up not found",
          });
          continue;
        }

        if (!followUp.draftFollowUp) {
          results.push({
            followUpId,
            success: false,
            error: "No draft available",
          });
          continue;
        }

        followUp.sendStatus = "sending";
        followUp.sendError = null;
        await this.followUpRepository.save(followUp);

        const threadEmails = await this.emailRepository.find({
          where: { userId, threadId: followUp.threadId },
          order: { receivedAt: "DESC" },
          take: 1,
        });

        if (threadEmails.length === 0) throw new Error("Thread not found");

        const lastEmail = threadEmails[0];
        const recipient = EncryptionHelper.decrypt(lastEmail.from);
        let subject =
          followUp.subject ||
          EncryptionHelper.decrypt(lastEmail.subject) ||
          "Follow up";

        if (!subject.toLowerCase().startsWith("re:")) {
          subject = `Re: ${subject}`;
        }

        const draft = EncryptionHelper.decrypt(followUp.draftFollowUp);
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

        results.push({ followUpId, success: true });
      } catch (error) {
        this.logger.error(`Error sending follow-up ${followUpId}:`, error);

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

        results.push({
          followUpId,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.log(
      `[Worker ${workerId}] Bulk send completed: ${results.filter((r) => r.success).length}/${results.length} succeeded`,
    );

    return results;
  }
}
