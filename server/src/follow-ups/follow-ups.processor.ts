import {
  Injectable,
  OnModuleInit,
  Logger,
  Inject,
  forwardRef,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import PgBoss from "pg-boss";
import {
  FollowUp,
  FollowUpStatus,
} from "../database/entities/follow-up.entity";
import { Email } from "../database/entities/email.entity";
import { FollowUpsService } from "./follow-ups.service";
import { LLMService } from "../llm/llm.service";
import { ContextService } from "../context/context.service";
import { ContextKey } from "../database/entities/user-context.entity";
import { UsersService } from "../users/users.service";
import { EmailProviderManager } from "../emails/email-provider-manager.service";
import { calculateBusinessDays } from "../utils/business-days.util";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { THREAD_LIMITS } from "../constants/llm-constants";
import { HTTP_STATUS } from "../constants/service-constants";

@Injectable()
export class FollowUpsProcessor implements OnModuleInit {
  private readonly logger = new Logger(FollowUpsProcessor.name);

  // eslint-disable-next-line max-params
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

  // eslint-disable-next-line max-lines-per-function
  async onModuleInit() {
    // Worker for generating follow-up drafts
    this.logger.log("Registering generate-follow-up-draft worker");
    // eslint-disable-next-line max-lines-per-function, max-statements
    await this.boss.work("generate-follow-up-draft", async (job) => {
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

        // Skip if already has draft
        if (followUp.draftFollowUp) {
          this.logger.log(
            `Follow-up ${followUpId} already has draft, skipping`,
          );
          return;
        }

        // Update status to generating
        followUp.generationStatus = "generating";
        followUp.generationError = null;
        await this.followUpRepository.save(followUp);

        // Get user to check email
        const user = await this.usersService.findOne(userId);
        if (!user) {
          throw new Error("User not found");
        }
        const userEmail = EncryptionHelper.decrypt(user.email);

        // Get thread emails (last 3-5 messages)
        const threadEmails = await this.emailRepository.find({
          where: { userId, threadId },
          order: { receivedAt: "ASC" },
        });

        if (threadEmails.length === 0) {
          throw new Error("No emails found in thread");
        }

        // Get last N messages (or all if less than N)
        const lastMessages = threadEmails.slice(-THREAD_LIMITS.LAST_MESSAGES);

        // Build thread messages with isFromUser flag
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

        // Find last user message for business days calculation
        const lastUserMessage = threadMessages
          .filter((message) => message.isFromUser)
          .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];

        if (!lastUserMessage) {
          throw new Error("No user message found in thread");
        }

        // Calculate business days waiting
        const now = new Date();
        const businessDaysWaiting = calculateBusinessDays(
          lastUserMessage.receivedAt,
          now,
        );

        // Get user communication style
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

        // Get recipient name
        const lastTheirMessage = threadMessages
          .filter((message) => !message.isFromUser)
          .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())[0];
        const theirName =
          lastTheirMessage?.fromName || lastTheirMessage?.from || "there";

        // Generate draft
        const draft = await this.llmService.generateFollowUpDraft(
          followUp.subject || "Follow up",
          threadMessages,
          theirName,
          businessDaysWaiting,
          userCommunicationStyle,
          undefined,
          userId,
        );

        // Save draft
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

        // Save error state
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
    });

    // Worker for bulk sending follow-ups
    this.logger.log("Registering bulk-send-follow-ups worker");
    // eslint-disable-next-line max-lines-per-function, max-statements, complexity
    await this.boss.work("bulk-send-follow-ups", async (job) => {
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

          // Update send status
          followUp.sendStatus = "sending";
          followUp.sendError = null;
          await this.followUpRepository.save(followUp);

          // Get thread info
          const threadEmails = await this.emailRepository.find({
            where: { userId, threadId: followUp.threadId },
            order: { receivedAt: "DESC" },
            take: 1,
          });

          if (threadEmails.length === 0) {
            throw new Error("Thread not found");
          }

          const lastEmail = threadEmails[0];
          const recipient = EncryptionHelper.decrypt(lastEmail.from);
          let subject =
            followUp.subject ||
            EncryptionHelper.decrypt(lastEmail.subject) ||
            "Follow up";

          // Ensure subject has Re: prefix if not already present
          if (!subject.toLowerCase().startsWith("re:")) {
            subject = `Re: ${subject}`;
          }

          // Get email provider and send
          const provider =
            await this.emailProviderManager.getPrimaryProvider(userId);
          if (!provider) {
            throw new Error("No email provider connected");
          }

          const draft = EncryptionHelper.decrypt(followUp.draftFollowUp);

          // Send with exponential backoff for rate limiting
          let retries = 0;
          const maxRetries = 3;
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
              break;
              // Success, exit retry loop
            } catch (error: unknown) {
              lastError = error as Error;

              // Check if it's a rate limit error (HTTP 429 Too Many Requests)
              const apiError = error as {
                code?: number;
                response?: { status?: number };
              };
              if (
                apiError.code === HTTP_STATUS.TOO_MANY_REQUESTS ||
                (apiError.response &&
                  apiError.response.status === HTTP_STATUS.TOO_MANY_REQUESTS)
              ) {
                retries++;
                if (retries < maxRetries) {
                  // Exponential backoff: 2^retries seconds
                  const backoffSeconds = Math.pow(2, retries);
                  this.logger.warn(
                    `Rate limit hit for follow-up ${followUpId}, retrying in ${backoffSeconds}s (attempt ${retries}/${maxRetries})`,
                  );
                  await new Promise((resolve) =>
                    setTimeout(resolve, backoffSeconds * 1000),
                  );
                  continue;
                }
              } else {
                // Not a rate limit error, don't retry
                throw error;
              }
            }
          }

          if (retries >= maxRetries && lastError) {
            throw lastError;
          }

          // Mark as sent
          followUp.sendStatus = "sent";
          followUp.status = FollowUpStatus.COMPLETED;
          await this.followUpRepository.save(followUp);

          results.push({ followUpId, success: true });
        } catch (error) {
          this.logger.error(`Error sending follow-up ${followUpId}:`, error);

          // Update error state
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
    });

    this.logger.log("Follow-ups processor initialized");
  }
}
