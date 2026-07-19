import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { PERFORMANCE_BUDGETS } from "../constants/performance-budgets";
import { DISPLAY_CONSTANTS } from "../constants/service-constants";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import { decryptUserContextEntityForApi } from "../encryption/entity-api-decrypt.util";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { LLMService } from "../llm/llm.service";
import { writeAnalysisLog } from "./context-analysis-logger";
import { SentEmailData } from "./context-gmail-data.service";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";

/**
 * Minimum number of times a question must recur (per the LLM's self-reported
 * `frequency`) before we keep it as a learned Q&A pair. Set to 2 rather than 3
 * so that lower-volume mailboxes still surface drafts — requiring the same
 * inbound question three times produced almost nothing for most users. All
 * pairs land as UNAPPROVED and require explicit user approval before use, so a
 * slightly lower bar only affects what appears for review, not what is trusted.
 */
const MIN_QA_FREQUENCY = 2;

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
      const qaPayload = sentEmailsData.map((email) => ({
        subject: email.subject,
        body: cleanEmailContent(
          email.body,
          email.htmlBody,
          PERFORMANCE_BUDGETS.PRIORITY_EXPLANATION,
        ),
        receivedAt: email.receivedAt.toISOString(),
      }));
      const qaAnalysis = await this.llmService.extractQAndA(qaPayload, userId);
      if (qaAnalysis && qaAnalysis.length > 0) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] Found ${qaAnalysis.length} common Q&A pairs`,
        );
        // Use repository.find() (not createQueryBuilder) to ensure TypeORM
        // column transformers run correctly and decrypt contextValue/explanation.
        const existingQAs = await this.contextRepository.find({
          where: { userId, contextKey: ContextKey.Q_AND_A },
        });
        // Belt-and-suspenders: force-decrypt in case of hydration edge cases.
        for (const qa of existingQAs) {
          decryptUserContextEntityForApi(qa);
        }
        this.logger.log(
          `[CONTEXT-ANALYSIS] Found ${existingQAs.length} existing Q&A pairs in database for deduplication`,
        );
        await this.deduplicateAndSaveQAs(userId, qaAnalysis, existingQAs);
      }
      this.logger.log(
        "[CONTEXT-ANALYSIS-QA] Q&A extraction completed successfully",
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
      throw error;
    }
  }

  private async deduplicateAndSaveQAs(
    userId: string,
    qaAnalysis: Array<{ question: string; answer: string; frequency: number }>,
    existingQAs: UserContext[],
  ): Promise<void> {
    const existingQuestions = new Set<string>();
    const existingAnswers = new Set<string>();
    for (const existingQA of existingQAs) {
      const qaMatch = existingQA.contextValue.match(
        /^Q:\s*(.+?)\s*\|\s*A:\s*(.+)$/,
      );
      if (qaMatch) {
        existingQuestions.add(qaMatch[1].toLowerCase().trim());
        existingAnswers.add(qaMatch[2].toLowerCase().trim());
      }
    }

    const seenQuestions = new Set<string>();
    const seenAnswers = new Set<string>();

    for (const qa of qaAnalysis) {
      if (!qa.question || !qa.answer || qa.frequency < MIN_QA_FREQUENCY)
        continue;
      const normalizedQuestion = qa.question.toLowerCase().trim();
      const normalizedAnswer = qa.answer.toLowerCase().trim();
      if (
        this.isQADuplicate({
          normalizedQuestion,
          normalizedAnswer,
          seenQuestions,
          seenAnswers,
          existingQuestions,
          existingAnswers,
        })
      ) {
        this.logger.log(
          `[CONTEXT-ANALYSIS] Skipping duplicate Q&A: ${qa.question.substring(0, DISPLAY_CONSTANTS.LOG_PREVIEW_LENGTH)}...`,
        );
        continue;
      }
      seenQuestions.add(normalizedQuestion);
      seenAnswers.add(normalizedAnswer);
      // Find matching existing entity (already decrypted) so saveQAPair can
      // update it without a broken findOne on an encrypted column.
      const matchedExisting = existingQAs.find((existing) => {
        const parsed = existing.contextValue.match(
          /^Q:\s*(.+?)\s*\|\s*A:\s*(.+)$/,
        );
        if (!parsed) return false;
        return (
          parsed[1].toLowerCase().trim() === normalizedQuestion &&
          parsed[2].toLowerCase().trim() === normalizedAnswer
        );
      });
      await this.saveQAPair(userId, qa, matchedExisting);
    }
  }

  private isQADuplicate(options: {
    normalizedQuestion: string;
    normalizedAnswer: string;
    seenQuestions: Set<string>;
    seenAnswers: Set<string>;
    existingQuestions: Set<string>;
    existingAnswers: Set<string>;
  }): boolean {
    const {
      normalizedQuestion,
      normalizedAnswer,
      seenQuestions,
      seenAnswers,
      existingQuestions,
      existingAnswers,
    } = options;
    const similar = (strA: string, strB: string) =>
      this.piiRedactionService.areContextValuesSimilar(strA, strB);
    return (
      [...seenQuestions].some((query) => similar(normalizedQuestion, query)) ||
      [...seenAnswers].some((itemA) => similar(normalizedAnswer, itemA)) ||
      [...existingQuestions].some((query) =>
        similar(normalizedQuestion, query),
      ) ||
      [...existingAnswers].some((itemA) => similar(normalizedAnswer, itemA))
    );
  }

  private async saveQAPair(
    userId: string,
    qa: { question: string; answer: string; frequency: number },
    existingEntity?: UserContext,
  ): Promise<void> {
    const qaValue = `Q: ${qa.question} | A: ${qa.answer}`;
    const explanation = qa.frequency
      ? `Appeared ${qa.frequency} times in your replies`
      : undefined;
    // Do NOT use findOne({ where: { contextValue: qaValue } }) — AES-GCM uses
    // random IVs so the same plaintext produces different ciphertext each time,
    // meaning a WHERE comparison against the encrypted column always fails.
    // Instead, the caller passes the already-decrypted matching entity (if any).
    if (existingEntity) {
      existingEntity.lastModified = new Date();
      await this.contextRepository.save(existingEntity);
    } else {
      const context = this.contextRepository.create({
        userId,
        contextKey: ContextKey.Q_AND_A,
        contextValue: qaValue,
        source: Source.UNAPPROVED,
        explanation,
      });
      await this.contextRepository.save(context);
    }
    this.logger.log(
      `[CONTEXT-ANALYSIS] Added Q&A: ${qa.question.substring(0, DISPLAY_CONSTANTS.LOG_PREVIEW_LENGTH)}...`,
    );
  }
}
