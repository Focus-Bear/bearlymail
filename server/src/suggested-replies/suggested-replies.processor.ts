import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import PgBoss from "pg-boss";
import { Email } from "../database/entities/email.entity";
import { SuggestedRepliesService } from "./suggested-replies.service";
import { LLMService } from "../llm/llm.service";
import { UsersService } from "../users/users.service";
import { JobPerformanceTracker } from "../queue/job-performance-tracker";
import { EncryptionHelper } from "../encryption/encryption.helper";
import { CloudWatchService } from "../aws/cloudwatch.service";
import { QUERY_LIMITS } from "../constants/query-limits";
import { StructuralError } from "../errors/structural-error";

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
      async (job) => {
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

          const user = await this.usersService.findOne(userId);
          if (!user) {
            this.logger.warn(`[Worker ${workerId}] User ${userId} not found`);
            return;
          }

          const userEmail = EncryptionHelper.decrypt(user.email)?.toLowerCase();

          const latestEmailInThread = await this.emailRepository.findOne({
            where: { emailThreadId: threadId, userId },
            order: { receivedAt: "DESC" },
          });

          if (!latestEmailInThread) {
            this.logger.warn(
              `[Worker ${workerId}] No emails found in thread ${threadId} for user ${userId}`,
            );
            return;
          }

          const lastEmailFrom = latestEmailInThread.from?.toLowerCase() || "";
          const userSentLast = userEmail && lastEmailFrom === userEmail;

          await this.suggestedRepliesService.markAsGenerating(userId, threadId);

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
          };

          tracker.endPhase("dataFetch");
          tracker.startPhase("llmCall");

          let options: Array<{ label: string; text: string }>;

          if (userSentLast) {
            this.logger.log(
              `[Worker ${workerId}] User sent last email - generating follow-up suggestion for thread ${threadId.substring(0, QUERY_LIMITS.THREAD_ID_SHORT)}...`,
            );

            const threadEmails = await this.emailRepository.find({
              where: { emailThreadId: threadId, userId },
              order: { receivedAt: "ASC" },
              take: 5,
            });

            const recipientName =
              threadEmails.find((e) => e.from?.toLowerCase() !== userEmail)
                ?.fromName || "there";

            const lastUserEmailDate = latestEmailInThread.receivedAt;
            const now = new Date();
            const daysSinceLastEmail = Math.floor(
              (now.getTime() - new Date(lastUserEmailDate).getTime()) /
                (1000 * 60 * 60 * 24),
            );

            const threadMessages = threadEmails.map((e) => ({
              from: e.from || "",
              fromName: e.fromName || undefined,
              body: e.body || "",
              receivedAt: e.receivedAt,
              isFromUser: e.from?.toLowerCase() === userEmail,
            }));

            const followUpText = await this.llmService.generateFollowUpDraft(
              latestEmailInThread.subject || "",
              threadMessages,
              recipientName,
              Math.max(1, daysSinceLastEmail),
              {
                tone: userContext.tone,
                commonPhrases: emailExamples,
              },
              undefined,
              userId,
            );

            options = [{ label: "Follow Up", text: followUpText }];
          } else {
            options = await this.llmService.generateReplyOptions(
              {
                from: latestEmailInThread.from || "",
                fromName: latestEmailInThread.fromName || undefined,
                subject: latestEmailInThread.subject || "",
                body: latestEmailInThread.body || "",
              },
              userContext,
              undefined,
              userId,
            );
          }

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
          // Check if this is a structural error (missing prompts, config issues, etc.)
          if (StructuralError.isStructuralError(error)) {
            this.logger.error(
              `[STRUCTURAL ERROR - NO RETRY] [Worker ${workerId}] Suggested replies job failed for thread ${threadId}: ${error.message}`,
            );
            await this.suggestedRepliesService.markAsNotGenerating(
              userId,
              threadId,
            );
            tracker.finish(error);
            // Return error object instead of throwing to prevent retries
            return {
              error: "StructuralError",
              message: error.message,
              threadId,
            };
          }

          this.logger.error(
            `[Worker ${workerId}] Failed to generate suggested replies for thread ${threadId}`,
            error,
          );

          await this.suggestedRepliesService.markAsNotGenerating(
            userId,
            threadId,
          );

          tracker.finish(error as Error);
          throw error;
        }
      },
    );

    this.logger.log(
      "generate-suggested-replies worker registered successfully",
    );
  }
}
