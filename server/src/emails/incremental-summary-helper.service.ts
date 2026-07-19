import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, Not, Repository } from "typeorm";

import { SearchIndexHelper } from "../contacts/search-index.helper";
import {
  Contact,
  DEFAULT_CONTACT_TYPES,
} from "../database/entities/contact.entity";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { IncrementalAnalysisService } from "../llm/incremental-analysis.service";
import { extractEmailAddress } from "../utils/email-address.utils";
import { EmailsService } from "./emails.service";

const CONTACT_TYPE_CONFIDENCE_THRESHOLD = 0.6;
const THREAD_EMAIL_FETCH_LIMIT = 50;

/**
 * Helper service for incremental thread-summary updates. Extracted from
 * LLMSummaryProcessorService to keep that file under the max-lines limit.
 */
@Injectable()
export class IncrementalSummaryHelperService {
  private readonly logger = new Logger(IncrementalSummaryHelperService.name);

  constructor(
    @InjectRepository(Email)
    private readonly emailRepository: Repository<Email>,
    @InjectRepository(EmailThread)
    private readonly emailThreadRepository: Repository<EmailThread>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly emailsService: EmailsService,
    private readonly incrementalAnalysisService: IncrementalAnalysisService,
  ) {}

  /**
   * Incremental summary: when the thread already has a summary, find the emails
   * received after lastSummarizedAt and apply one LLM call per new email,
   * chaining each result as the next existingSummary. Returns null when no
   * existing summary is found (caller falls back to full summarisation).
   */
  async computeIncrementalSummary(
    userId: string,
    email: Email,
  ): Promise<string | null> {
    if (!email.emailThreadId) return null;

    const [existingSummary, thread] = await Promise.all([
      this.getThreadSummary(email.emailThreadId),
      this.emailThreadRepository.findOne({
        where: { id: email.emailThreadId },
        select: {
          id: true,
          lastSummarizedAt: true,
        },
      }),
    ]);

    if (!existingSummary || !thread?.lastSummarizedAt) return null;

    // Fetch the most-recent messages (DESC) so threads longer than the limit
    // still surface their newest emails — an ASC+limit window would return the
    // oldest messages and miss every new arrival on long threads. We then keep
    // only emails after lastSummarizedAt and process them oldest-first.
    const recentThreadEmails = await this.emailsService.getThreadEmails(
      userId,
      email.threadId,
      { order: "DESC", limit: THREAD_EMAIL_FETCH_LIMIT },
    );

    const newEmails = recentThreadEmails
      .filter(
        (threadEmail) =>
          threadEmail.receivedAt != null &&
          new Date(threadEmail.receivedAt) > thread.lastSummarizedAt!,
      )
      .sort(
        (first, second) =>
          new Date(first.receivedAt).getTime() -
          new Date(second.receivedAt).getTime(),
      );

    if (newEmails.length === 0) return existingSummary;

    let currentSummary = existingSummary;
    for (const newEmail of newEmails) {
      const result =
        await this.incrementalAnalysisService.updateSummaryIncrementally({
          existingSummary: currentSummary,
          newEmail: {
            from: newEmail.from || "",
            fromName: newEmail.fromName,
            subject: newEmail.subject || "",
            body: newEmail.body || "",
            htmlBody: newEmail.htmlBody,
            receivedAt: newEmail.receivedAt || new Date(),
          },
          userId,
        });
      currentSummary = result.updatedSummary;
    }

    return currentSummary;
  }

  async updateSummaryIncrementally(
    email: Email,
    existingSummary: string,
    userId: string,
  ): Promise<void> {
    try {
      const senderEmail = extractEmailAddress(email.from || "");
      let needsContactTypeGuess = false;
      let contact: Contact | null = null;

      if (senderEmail) {
        const emailHash = SearchIndexHelper.hashExact(senderEmail);
        contact = await this.contactRepository.findOne({
          where: { userId, emailHash },
          select: {
            id: true,
            contactType: true,
            contactTypeAutoDetected: true,
          },
        });

        if (
          contact &&
          (!contact.contactType || contact.contactTypeAutoDetected)
        ) {
          needsContactTypeGuess = true;
        }
      }

      const newEmailData = {
        from: email.from || "",
        fromName: email.fromName,
        subject: email.subject || "",
        body: email.body || "",
        htmlBody: email.htmlBody,
        receivedAt: email.receivedAt || new Date(),
      };

      const result =
        await this.incrementalAnalysisService.updateSummaryIncrementally({
          existingSummary,
          newEmail: newEmailData,
          isResolution: false,
          userId,
          needsContactTypeGuess,
        });

      if (result.updatedSummary && result.updatedSummary !== existingSummary) {
        if (email.emailThreadId) {
          const threadEmails = await this.emailRepository.find({
            where: { emailThreadId: email.emailThreadId },
            select: {
              id: true,
            },
          });
          const threadEmailIds = threadEmails.map(
            (emailEntry) => emailEntry.id,
          );

          await this.emailRepository.update(
            { id: In(threadEmailIds) },
            { summary: result.updatedSummary, isProcessingSummary: false },
          );

          // Mark up to the new email's own receivedAt (not `now`): emails that
          // arrive between this one and `now` must still be detected as new on
          // the next run, matching the staleness check in computeIncrementalSummary.
          await this.emailThreadRepository.update(
            { id: email.emailThreadId },
            { lastSummarizedAt: email.receivedAt },
          );

          this.logger.log(
            `Updated summary incrementally for thread ${email.emailThreadId} (${threadEmailIds.length} emails)`,
          );
        }
      }

      if (
        needsContactTypeGuess &&
        contact &&
        result.suggestedContactType &&
        (result.contactTypeConfidence ?? 0) >= CONTACT_TYPE_CONFIDENCE_THRESHOLD
      ) {
        if (
          DEFAULT_CONTACT_TYPES.includes(
            result.suggestedContactType as (typeof DEFAULT_CONTACT_TYPES)[number],
          )
        ) {
          await this.contactRepository.update(contact.id, {
            contactType: result.suggestedContactType,
            contactTypeAutoDetected: true,
          });
          this.logger.log(
            `Auto-classified contact ${senderEmail} as ${result.suggestedContactType} (confidence: ${result.contactTypeConfidence})`,
          );
        }
      }
    } catch (error) {
      this.logger.warn("Failed to update summary incrementally:", error);
    }
  }

  async getThreadSummary(
    emailThreadId: string | undefined,
  ): Promise<string | null> {
    if (!emailThreadId) {
      return null;
    }
    const emailWithSummary = await this.emailRepository.findOne({
      where: { emailThreadId, summary: Not(IsNull()) },
      select: {
        summary: true,
      },
    });
    return emailWithSummary?.summary || null;
  }
}
