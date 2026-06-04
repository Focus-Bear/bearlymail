import {
  BODY_PREVIEW_LENGTHS,
  QA_KEYWORD_REGEX,
  QA_KEYWORD_SCAN,
} from "../constants/llm-constants";
import { Email } from "../database/entities/email.entity";
import { EmailThread } from "../database/entities/email-thread.entity";
import { cleanEmailContent } from "../llm/email-content-cleaner";

export interface BatchEmailPayload {
  emailKey: string;
  from: string;
  fromName?: string;
  senderJobTitle?: string;
  subject: string;
  body: string;
  preComputedSentimentScore?: number;
  existingUrgencyScore?: number;
  existingCategory?: string;
}

/**
 * Builds the per-email payloads sent to the batch priority LLM. QA-related
 * emails always use the raw body so the model sees the actual pass/fail verdict
 * (summaries may strip it — fixes #1453 Bug 1).
 */
export function buildBatchEmailPayloads(
  emailsToProcess: Email[],
  threadMap?: Map<string, EmailThread>,
  categoryMap?: Map<string, string>,
): BatchEmailPayload[] {
  return emailsToProcess.map((email) => {
    const isQaRelated =
      QA_KEYWORD_REGEX.test(email.subject || "") ||
      QA_KEYWORD_REGEX.test(
        email.body?.substring(0, QA_KEYWORD_SCAN.QA_KEYWORD_BODY_SCAN_CHARS) ||
          "",
      );
    const bodyForBatch =
      !isQaRelated && email.summary?.trim()
        ? email.summary
        : cleanEmailContent(
            email.body,
            email.htmlBody,
            BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
          );
    const thread =
      threadMap && email.emailThreadId
        ? threadMap.get(email.emailThreadId)
        : undefined;
    return {
      emailKey: email.id,
      from: email.from || "",
      fromName: email.fromName,
      senderJobTitle: email.senderJobTitle,
      subject: email.subject || "",
      body: bodyForBatch,
      preComputedSentimentScore: email.sentimentScore ?? undefined,
      existingUrgencyScore:
        thread?.urgencyScore !== undefined && thread.urgencyScore !== null
          ? thread.urgencyScore
          : undefined,
      existingCategory:
        thread?.categoryId && categoryMap
          ? categoryMap.get(thread.categoryId)
          : undefined,
    };
  });
}
