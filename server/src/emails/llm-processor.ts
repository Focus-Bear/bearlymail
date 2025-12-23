import { Injectable, OnModuleInit, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import * as os from "os";
import PgBoss = require("pg-boss");
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { EmailsService } from "./emails.service";
import { PriorityService } from "../priority/priority.service";
import { SummarizationService } from "../summarization/summarization.service";
import { LLMService } from "../llm/llm.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { ContextKey } from "../database/entities/user-context.entity";

@Injectable()
export class LLMProcessor implements OnModuleInit {
  private readonly logger = new Logger(LLMProcessor.name);
  private readonly priorityConcurrency: number;
  private readonly summaryConcurrency: number;

  constructor(
    @Inject("PG_BOSS") private boss: PgBoss,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private emailThreadRepository: Repository<EmailThread>,
    private emailsService: EmailsService,
    private priorityService: PriorityService,
    private summarizationService: SummarizationService,
    private llmService: LLMService,
    private configService: ConfigService,
  ) {
    // Get CPU cores for optimal concurrency
    const cpuCores = os.cpus().length;
    // For LLM jobs (I/O bound), we can use more workers than CPU cores
    // Default to 2x CPU cores, but allow override via env vars
    const defaultConcurrency = Math.max(4, cpuCores * 2);

    this.priorityConcurrency = parseInt(
      this.configService.get<string>("LLM_PRIORITY_CONCURRENCY") ||
        String(defaultConcurrency),
      10,
    );
    this.summaryConcurrency = parseInt(
      this.configService.get<string>("LLM_SUMMARY_CONCURRENCY") ||
        String(defaultConcurrency),
      10,
    );

    this.logger.log(
      `CPU cores: ${cpuCores}, LLM worker concurrency: priority=${this.priorityConcurrency}, summary=${this.summaryConcurrency}`,
    );
  }

  async onModuleInit() {
    // Worker for LLM priority refinement - process multiple jobs in parallel
    // teamSize determines how many concurrent workers process jobs from this queue
    this.logger.log(
      `Starting priority refinement worker with concurrency: ${this.priorityConcurrency}`,
    );
    await this.boss.work(
      "refine-priority",
      { teamSize: this.priorityConcurrency } as any,
      async (job) => {
        const { userId, emailId } = job.data as {
          userId: string;
          emailId: string;
        };
        const workerId = job.id || "unknown";
        this.logger.log(
          `[Worker ${workerId}] Starting LLM priority refinement for email ${emailId}`,
        );

        try {
          const email = await this.emailsService.getEmailById(userId, emailId);
          if (!email) {
            this.logger.warn(`Email ${emailId} not found`);
            return;
          }

          // Skip if priority already exists and is not a default/placeholder value
          if (
            email.priorityScore &&
            email.priorityScore !== 50 &&
            !email.isProcessingPriority
          ) {
            this.logger.log(
              `[Worker ${workerId}] Skipping priority refinement for email ${emailId} (thread: ${email.threadId?.substring(0, 8)}...) - already has priority: ${email.priorityScore}`,
            );
            return;
          }

          // OPTIMIZED: Prepare all data in parallel before LLM call
          // This allows the worker to do other work while waiting for LLM
          const [userEmails, contexts] = await Promise.all([
            // Fetch user email history for avgTimeToReply
            this.emailRepository.find({
              where: { userId },
              take: 50,
              order: { receivedAt: "DESC" },
            }),
            // Fetch user contexts for basic score calculation
            this.priorityService.getUserContexts(userId),
          ]);

          const avgTimeToReply =
            userEmails.length > 0
              ? userEmails
                  .filter((e) => e.timeToReply)
                  .reduce((sum, e) => sum + (e.timeToReply || 0), 0) /
                userEmails.filter((e) => e.timeToReply).length
              : undefined;

          // Calculate basic score (synchronous, fast)
          const basicScore = this.priorityService.calculateBasicPriorityScore(
            email,
            contexts,
          );

          this.logger.log(
            `[Worker ${workerId}] Analyzing priority for email ${emailId} (thread: ${email.threadId?.substring(0, 8)}..., subject: ${email.subject?.substring(0, 50)}...)`,
          );

          // Clean email body: strip HTML, remove signatures, limit to 2000 chars
          const cleanedBody = cleanEmailContent(
            email.body,
            email.htmlBody,
            2000,
          );

          // LLM call - analyze priority (includes sentiment analysis)
          // The teamSize concurrency setting allows multiple workers to process different emails in parallel
          const llmResult = await this.llmService.analyzePriority(
            {
              from: email.from || "",
              fromName: email.fromName,
              senderJobTitle: email.senderJobTitle,
              subject: email.subject || "",
              body: cleanedBody,
            },
            {
              averageTimeToReply: avgTimeToReply,
            },
            undefined, // provider - use default
            userId, // pass userId to use user's API key if available
          );

          // Calculate explicit goal alignment and sentiment scores
          const emailText =
            `${email.subject || ""} ${email.body || ""}`.toLowerCase();
          const goals = contexts.filter(
            (c) => c.contextKey === ContextKey.MY_GOALS,
          );
          let goalAlignmentScore = 0;
          if (goals.length > 0) {
            const matchingGoals = goals.filter((goal) => {
              const keywords = goal.contextValue
                .toLowerCase()
                .split(/[,;]/)
                .map((k) => k.trim())
                .filter(Boolean);
              return keywords.some((keyword) => emailText.includes(keyword));
            });
            goalAlignmentScore = Math.min(
              100,
              Math.round((matchingGoals.length / goals.length) * 100),
            );
          }

          // Get sentiment score from LLM (required, no fallback to old score)
          const sentimentScore = llmResult.sentimentScore ?? 0;
          // Convert sentiment (-1 to 1) to 0-100 scale (negative = high priority)
          const sentimentScoreNormalized = Math.max(
            0,
            Math.min(100, 50 - sentimentScore * 50),
          );

          // Get urgency score from LLM
          const urgencyScore = llmResult.urgencyScore || 0;
          // Convert urgency (0-100) to contribution: urgency of 50 is neutral (0 contribution), 90+ is high (+12)
          const urgencyContribution = Math.round((urgencyScore - 50) * 0.3);

          // Calculate total score from components:
          // - Goal alignment: 40% weight
          // - Sentiment: 30% weight  
          // - Other factors (VIP, job title, etc.): 30% weight
          // - Urgency: additional contribution on top
          const goalAlignmentContribution = Math.round(goalAlignmentScore * 0.4);
          const sentimentContribution = Math.round(sentimentScoreNormalized * 0.3) - 15; // Adjust for neutral (15 = 50 * 0.3)
          const otherFactorsContribution = Math.round(basicScore * 0.3);
          
          // Total = base components + urgency adjustment
          const combinedScore = 
            goalAlignmentContribution + 
            (sentimentContribution + 15) + // Add back the neutral baseline
            otherFactorsContribution +
            urgencyContribution;

          // Update email with refined score and sentiment (sentiment is included in priority analysis)
          await this.emailRepository.update(
            { id: emailId },
            {
              priorityScore: Math.max(0, Math.min(100, combinedScore)),
              sentimentScore:
                llmResult.sentimentScore !== undefined
                  ? llmResult.sentimentScore
                  : null, // Store sentiment score (-1 to 1) from priority analysis
              isProcessingPriority: false,
            },
          );

          // Update EmailThread with urgency score and explanation
          // Use the highest urgency score from all emails in the thread
          if (email.emailThreadId) {
            const threadEmails = await this.emailRepository.find({
              where: { emailThreadId: email.emailThreadId },
              select: ["id"],
            });

            // Get all urgency scores from LLM results for this thread (we'll use current email's score for now)
            // In a more sophisticated implementation, we could track all emails' urgency scores
            const thread = await this.emailThreadRepository.findOne({
              where: { id: email.emailThreadId },
            });

            if (thread) {
              // Use the maximum urgency score between existing thread score and new email's score
              const newUrgencyScore = Math.max(
                thread.urgencyScore || 0,
                llmResult.urgencyScore || 0,
              );

              // Update urgency explanation if this email has a higher urgency score
              const newUrgencyExplanation =
                (llmResult.urgencyScore || 0) > (thread.urgencyScore || 0)
                  ? llmResult.urgencyExplanation
                  : thread.urgencyExplanation;

              await this.emailThreadRepository.update(
                { id: email.emailThreadId },
                {
                  urgencyScore: newUrgencyScore,
                  urgencyExplanation:
                    newUrgencyExplanation || thread.urgencyExplanation,
                },
              );

              this.logger.log(
                `[Worker ${workerId}] Updated thread ${email.emailThreadId.substring(0, 8)}... urgencyScore: ${newUrgencyScore}`,
              );
            }
          }

          // Generate and save priority explanation (precompute it)
          // Refresh email to get updated priorityScore for explanation generation
          const updatedEmail = await this.emailsService.getEmailById(
            userId,
            emailId,
          );
          if (updatedEmail) {
            const priorityExplanation =
              await this.emailsService.getPriorityExplanation(userId, emailId);
            // Save the explanation (this will also compute it if not already computed)
            await this.emailRepository.update(
              { id: emailId },
              { priorityExplanation: priorityExplanation },
            );
          }

          this.logger.log(
            `[Worker ${workerId}] Refined priority for email ${emailId} (thread: ${email.threadId?.substring(0, 8)}...): ${combinedScore}`,
          );
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to refine priority for email ${emailId}`,
            error,
          );
          // Mark as not processing so it can be retried
          await this.emailRepository.update(
            { id: emailId },
            { isProcessingPriority: false },
          );
        }
      },
    );

    // Worker for summary generation - process multiple jobs in parallel
    this.logger.log(
      `Starting summary generation worker with concurrency: ${this.summaryConcurrency}`,
    );
    await this.boss.work(
      "generate-summary",
      { teamSize: this.summaryConcurrency } as any,
      async (job) => {
        const { userId, emailId } = job.data as {
          userId: string;
          emailId: string;
        };
        const workerId = job.id || "unknown";
        this.logger.log(
          `[Worker ${workerId}] Starting summary generation for email ${emailId}`,
        );

        try {
          const email = await this.emailsService.getEmailById(userId, emailId);
          if (!email) {
            this.logger.warn(
              `Email ${emailId} not found for summary generation`,
            );
            return;
          }

          // Skip if summary already exists
          if (
            email.summary &&
            email.summary.trim() !== "" &&
            !email.isProcessingSummary
          ) {
            this.logger.log(
              `[Worker ${workerId}] Skipping summary generation for email ${emailId} (thread: ${email.threadId?.substring(0, 8)}...) - already has summary`,
            );
            return;
          }

          this.logger.log(
            `[Worker ${workerId}] Generating thread summary for email ${emailId} (thread: ${email.threadId?.substring(0, 8)}..., subject: ${email.subject?.substring(0, 50)}...)`,
          );

          // Generate thread summary (uses last 3 messages)
          const summary = await this.summarizationService.summarizeEmail(
            userId,
            emailId,
            { type: "tldr" },
          );

          // Update all emails in the thread with the same summary (thread-level summary)
          const threadEmails = await this.emailsService.getThreadEmails(
            userId,
            email.threadId,
          );
          const emailIds = threadEmails.map((e) => e.id);

          await this.emailRepository.update(
            { id: In(emailIds) }, // Update all emails in thread
            {
              summary,
              isProcessingSummary: false,
            },
          );

          this.logger.log(
            `[Worker ${workerId}] Generated thread summary for thread ${email.threadId?.substring(0, 8)}... (${threadEmails.length} emails updated)`,
          );
        } catch (error) {
          this.logger.error(
            `[Worker ${workerId}] Failed to generate summary for email ${emailId}`,
            error,
          );
          // Mark as not processing
          await this.emailRepository.update(
            { id: emailId },
            { isProcessingSummary: false },
          );
        }
      },
    );
  }
}
