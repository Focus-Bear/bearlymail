import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { QA_EXTRACTION } from "../constants/llm-constants";
import { DISPLAY_CONSTANTS } from "../constants/service-constants";
import { AutoResponseLog } from "../database/entities/auto-response-log.entity";
import { Email } from "../database/entities/email.entity";
import {
  ContextKey,
  Source,
  UserContext,
} from "../database/entities/user-context.entity";
import {
  decryptEmailEntityForApi,
  decryptUserContextEntityForApi,
} from "../encryption/entity-api-decrypt.util";
import { LLMService } from "../llm/llm.service";
import { extractEmailAddress } from "../utils/email-address.utils";
import { writeAnalysisLog } from "./context-analysis-logger";
import { SentEmailData } from "./context-gmail-data.service";
import { ContextPiiRedactionService } from "./context-pii-redaction.service";
import {
  buildQaCandidatePairs,
  countDistinctAskers,
  formatQaPairsForPrompt,
  type QaCandidatePair,
  type QaInboundMessage,
  type VerifiedFaq,
  verifyQaClusters,
} from "./qa-candidates.helpers";

const QA_VALUE_PATTERN = /^Q:\s*(.+?)\s*\|\s*A:\s*(.+)$/;

/**
 * Learns FAQs from the user's mail: the questions different people keep asking
 * and how the user answers them. Each of the user's replies is paired with the
 * message it answered, so the model sees the real question instead of guessing
 * it from the answer. Machine mail and one-offs are dropped, and the model's
 * proposals pass a quality gate before anything is saved for review.
 */
@Injectable()
export class ContextQaExtractionService {
  private readonly logger = new Logger(ContextQaExtractionService.name);

  constructor(
    @InjectRepository(UserContext)
    private contextRepository: Repository<UserContext>,
    @InjectRepository(Email)
    private emailRepository: Repository<Email>,
    @InjectRepository(AutoResponseLog)
    private autoResponseLogRepository: Repository<AutoResponseLog>,
    private llmService: LLMService,
    private piiRedactionService: ContextPiiRedactionService,
  ) {}

  /**
   * Extracts recurring Q&A pairs from the user's sent replies and saves them
   * as UNAPPROVED suggestions.
   */
  async extractQAndAFromSentEmails(
    userId: string,
    sentEmailsData: SentEmailData[],
    userEmail: string,
  ): Promise<void> {
    if (!sentEmailsData || sentEmailsData.length === 0) {
      this.logger.log(
        "[CONTEXT-ANALYSIS-QA] No sent emails found for Q&A extraction",
      );
      return;
    }
    try {
      const pairs = await this.loadCandidatePairs(
        userId,
        sentEmailsData,
        userEmail,
      );
      const askerCount = countDistinctAskers(pairs);
      this.logger.log(
        `[CONTEXT-ANALYSIS-QA] ${pairs.length} question/reply pairs from ${askerCount} people in ${sentEmailsData.length} sent emails`,
      );
      // Too few people asked anything for a question to recur: skip the LLM call.
      if (askerCount < QA_EXTRACTION.MIN_DISTINCT_ASKERS) return;

      const clusters = await this.llmService.extractQAndA(
        formatQaPairsForPrompt(pairs),
        userId,
      );
      const faqs = verifyQaClusters(clusters, pairs);
      this.logger.log(
        `[CONTEXT-ANALYSIS-QA] ${faqs.length} of ${clusters.length} proposed FAQs passed the quality check`,
      );
      if (faqs.length === 0) return;

      await this.deduplicateAndSaveQAs(
        userId,
        faqs,
        await this.findExistingQAs(userId),
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `[CONTEXT-ANALYSIS-QA] Error extracting Q&A from replies: ${errorMessage}`,
      );
      writeAnalysisLog(`[QA] Error extracting Q&A: ${errorMessage}`, "error");
      throw error;
    }
  }

  /** Pairs each sent reply with the synced message it answered. */
  private async loadCandidatePairs(
    userId: string,
    sentEmailsData: SentEmailData[],
    userEmail: string,
  ): Promise<QaCandidatePair[]> {
    const threadIds = [
      ...new Set(sentEmailsData.map((email) => email.threadId)),
    ].filter(Boolean);
    if (threadIds.length === 0) return [];

    const inboundEmails = await this.emailRepository.find({
      where: { userId, threadId: In(threadIds) },
    });
    for (const email of inboundEmails) {
      decryptEmailEntityForApi(email);
    }

    return buildQaCandidatePairs({
      sentReplies: sentEmailsData,
      inboundMessages: inboundEmails.map(toInboundMessage),
      userAddresses: collectUserAddresses(sentEmailsData, userEmail),
      automatedReplyThreadIds: await this.findAutoRepliedThreadIds(
        userId,
        inboundEmails,
      ),
    });
  }

  /** Provider thread ids of threads the auto-responder has replied in. */
  private async findAutoRepliedThreadIds(
    userId: string,
    inboundEmails: Email[],
  ): Promise<Set<string>> {
    const threadIdByEmailThreadId = new Map(
      inboundEmails
        .filter((email) => Boolean(email.emailThreadId))
        .map((email) => [email.emailThreadId, email.threadId]),
    );
    if (threadIdByEmailThreadId.size === 0) return new Set();

    const logs = await this.autoResponseLogRepository.find({
      select: { emailThreadId: true },
      where: { userId, emailThreadId: In([...threadIdByEmailThreadId.keys()]) },
    });
    return new Set(
      logs
        .map((log) => threadIdByEmailThreadId.get(log.emailThreadId ?? ""))
        .filter((threadId): threadId is string => Boolean(threadId)),
    );
  }

  private async findExistingQAs(userId: string): Promise<UserContext[]> {
    // Use repository.find() (not createQueryBuilder) to ensure TypeORM
    // column transformers run correctly and decrypt contextValue/explanation.
    const existingQAs = await this.contextRepository.find({
      where: { userId, contextKey: ContextKey.Q_AND_A },
    });
    // Belt-and-suspenders: force-decrypt in case of hydration edge cases.
    for (const qa of existingQAs) {
      decryptUserContextEntityForApi(qa);
    }
    return existingQAs;
  }

  private async deduplicateAndSaveQAs(
    userId: string,
    faqs: VerifiedFaq[],
    existingQAs: UserContext[],
  ): Promise<void> {
    const existingQuestions = new Set<string>();
    const existingAnswers = new Set<string>();
    for (const existingQA of existingQAs) {
      const qaMatch = existingQA.contextValue.match(QA_VALUE_PATTERN);
      if (qaMatch) {
        existingQuestions.add(qaMatch[1].toLowerCase().trim());
        existingAnswers.add(qaMatch[2].toLowerCase().trim());
      }
    }

    const seenQuestions = new Set<string>();
    const seenAnswers = new Set<string>();

    for (const qa of faqs) {
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
        const parsed = existing.contextValue.match(QA_VALUE_PATTERN);
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
    qa: VerifiedFaq,
    existingEntity?: UserContext,
  ): Promise<void> {
    const qaValue = `Q: ${qa.question} | A: ${qa.answer}`;
    const explanation = `Asked by ${qa.askerCount} different people in your recent emails`;
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

function toInboundMessage(email: Email): QaInboundMessage {
  return {
    threadId: email.threadId,
    from: email.from,
    subject: email.subject,
    body: email.body,
    htmlBody: email.htmlBody ?? undefined,
    receivedAt: email.receivedAt,
  };
}

/** The user's login address plus every address their Sent folder used (aliases). */
function collectUserAddresses(
  sentEmailsData: SentEmailData[],
  userEmail: string,
): Set<string> {
  return new Set(
    [userEmail, ...sentEmailsData.map((email) => email.from)]
      .map(extractEmailAddress)
      .filter(Boolean),
  );
}
