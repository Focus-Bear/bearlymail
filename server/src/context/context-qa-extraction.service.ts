import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  UserContext,
  ContextKey,
  Source,
} from "../database/entities/user-context.entity";
import { LLMService } from "../llm/llm.service";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import { SentEmailData } from "./context-gmail-data.service";
import { getErrorMessage } from "../types/common";
import { writeAnalysisLog } from "./context-analysis-logger";

/**
 * Service for extracting Q&A pairs from user's sent emails.
 * Analyzes what questions the user is answering in their outbound emails.
 */
@Injectable()
export class ContextQaExtractionService {
  private readonly logger = new Logger(ContextQaExtractionService.name);

  constructor(
    @InjectRepository(UserContext)
    private contextRepository: Repository<UserContext>,
    private llmService: LLMService,
    private piiRedactionService: ContextPiiRedactionService,
  ) {}

  /**
   * Extract common Q&A pairs from user's sent emails
   */
  async extractQAndAFromSentEmails(
    userId: string,
    sentEmailsData: SentEmailData[],
  ): Promise<void> {
    this.logger.log(
      `[CONTEXT-ANALYSIS-QA] extractQAndAFromSentEmails called with userId=${userId}, sentEmailsData.length=${sentEmailsData?.length || 0}`,
    );
    writeAnalysisLog(
      `[QA] extractQAndAFromSentEmails called with userId=${userId}, sentEmailsData.length=${sentEmailsData?.length || 0}`,
      "log",
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS-QA] Services: llmService=${!!this.llmService}, piiRedactionService=${!!this.piiRedactionService}, contextRepository=${!!this.contextRepository}`,
    );
    writeAnalysisLog(
      `[QA] Services: llmService=${!!this.llmService}, piiRedactionService=${!!this.piiRedactionService}, contextRepository=${!!this.contextRepository}`,
      "debug",
    );
    try {
      if (!sentEmailsData || sentEmailsData.length === 0) {
        this.logger.log(
          "[CONTEXT-ANALYSIS-QA] No sent emails found for Q&A extraction",
        );
        return;
      }

      this.logger.log(
        `[CONTEXT-ANALYSIS-QA] Analyzing ${sentEmailsData.length} sent emails for common Q&A patterns...`,
      );

      // Extract Q&A pairs using LLM - analyze what questions the user is answering
      const qaPayload = sentEmailsData.map((email) => ({
        subject: email.subject,
        body: cleanEmailContent(
          email.body,
          email.htmlBody,
          PERFORMANCE_BUDGETS.PRIORITY_EXPLANATION,
        ),
        // Longer body to see full context
        receivedAt: email.receivedAt.toISOString(),
        // Use receivedAt to match LLM service signature (sentAt renamed)
      }));

      // Call LLM to extract common Q&A from sent emails
      const qaAnalysis = await this.llmService.extractQAndA(qaPayload, userId);

      if (qaAnalysis && qaAnalysis.length > 0) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] Found ${qaAnalysis.length} common Q&A pairs`,
        );

        // Get all existing Q&A from database first for better deduplication
        const existingQAs = await this.contextRepository
          .createQueryBuilder("context")
          .where("context.userId = :userId", { userId })
          .andWhere("context.contextKey = :key", { key: ContextKey.Q_AND_A })
          .getMany();

        this.logger.log(
          `[CONTEXT-ANALYSIS] Found ${existingQAs.length} existing Q&A pairs in database for deduplication`,
        );

        // Extract existing questions and answers from database
        const existingQuestions = new Set<string>();
        const existingAnswers = new Set<string>();
        for (const existingQA of existingQAs) {
          // Parse "Q: question | A: answer" format
          const qaMatch = existingQA.contextValue.match(
            /^Q:\s*(.+?)\s*\|\s*A:\s*(.+)$/,
          );
          if (qaMatch) {
            existingQuestions.add(qaMatch[1].toLowerCase().trim());
            existingAnswers.add(qaMatch[2].toLowerCase().trim());
          }
        }

        // Deduplicate Q&A before saving
        const seenQuestions = new Set<string>();
        const seenAnswers = new Set<string>();

        for (const qa of qaAnalysis) {
          if (!qa.question || !qa.answer) continue;

          // Skip if frequency is too low (should be 3+ but double-check)
          if (qa.frequency < 3) continue;

          // Normalize question and answer for deduplication
          const normalizedQuestion = qa.question.toLowerCase().trim();
          const normalizedAnswer = qa.answer.toLowerCase().trim();

          // Check for similar questions (using word overlap) in current batch
          let isDuplicate = false;
          for (const seenQ of seenQuestions) {
            if (
              this.piiRedactionService.areContextValuesSimilar(
                normalizedQuestion,
                seenQ,
              )
            ) {
              isDuplicate = true;
              break;
            }
          }

          // Check for similar answers in current batch
          if (!isDuplicate) {
            for (const seenA of seenAnswers) {
              if (
                this.piiRedactionService.areContextValuesSimilar(
                  normalizedAnswer,
                  seenA,
                )
              ) {
                isDuplicate = true;
                break;
              }
            }
          }

          // Check against existing database Q&A using similarity matching
          if (!isDuplicate) {
            for (const existingQ of existingQuestions) {
              if (
                this.piiRedactionService.areContextValuesSimilar(
                  normalizedQuestion,
                  existingQ,
                )
              ) {
                isDuplicate = true;
                break;
              }
            }
          }

          if (!isDuplicate) {
            for (const existingA of existingAnswers) {
              if (
                this.piiRedactionService.areContextValuesSimilar(
                  normalizedAnswer,
                  existingA,
                )
              ) {
                isDuplicate = true;
                break;
              }
            }
          }

          if (isDuplicate) {
            this.logger.log(
              `[CONTEXT-ANALYSIS] Skipping duplicate Q&A: ${qa.question.substring(0, 50)}...`, // eslint-disable-line @typescript-eslint/no-magic-numbers
            );
            continue;
          }

          seenQuestions.add(normalizedQuestion);
          seenAnswers.add(normalizedAnswer);

          // Store Q&A as "Q: question | A: answer"
          const qaValue = `Q: ${qa.question} | A: ${qa.answer}`;
          const explanation = qa.frequency
            ? `Appeared ${qa.frequency} times in your replies`
            : undefined;

          // Create or update context (same logic as createOrUpdateContext but inline)
          const existing = await this.contextRepository.findOne({
            where: {
              userId,
              contextKey: ContextKey.Q_AND_A,
              contextValue: qaValue,
            },
          });

          if (existing) {
            existing.lastModified = new Date();
            await this.contextRepository.save(existing);
          } else {
            const context = this.contextRepository.create({
              userId,
              contextKey: ContextKey.Q_AND_A,
              contextValue: qaValue,
              source: Source.AUTOGENERATED,
              explanation,
            });
            await this.contextRepository.save(context);
          }

          this.logger.log(
            // eslint-disable-next-line @typescript-eslint/no-magic-numbers
            `[CONTEXT-ANALYSIS] Added Q&A: ${qa.question.substring(0, 50)}...`,
          );
        }
      }
      this.logger.log(
        `[CONTEXT-ANALYSIS-QA] Q&A extraction completed successfully`,
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `[CONTEXT-ANALYSIS-QA] Error extracting Q&A from replies: ${errorMessage}`,
      );
      writeAnalysisLog(`[QA] Error extracting Q&A: ${errorMessage}`, "error");
      this.logger.error(
        `[CONTEXT-ANALYSIS-QA] Error stack: ${errorStack || "No stack trace"}`,
      );
      writeAnalysisLog(
        `[QA] Error stack: ${errorStack || "No stack trace"}`,
        "error",
      );
      // Don't fail the entire analysis if Q&A extraction fails
      throw error; // Re-throw so caller can handle it
    }
  }
}
