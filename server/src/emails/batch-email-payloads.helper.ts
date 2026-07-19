import {
  BODY_PREVIEW_LENGTHS,
  QA_KEYWORD_REGEX,
  QA_KEYWORD_SCAN,
  TIME_SENSITIVE_KEYWORD_REGEX,
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
  receivedAt?: Date;
  preComputedSentimentScore?: number;
  existingUrgencyScore?: number;
  existingCategory?: string;
}

/**
 * True when priority analysis must see the raw body instead of the stored
 * summary: QA emails (the summary may strip the pass/fail verdict — #1453
 * Bug 1) and time-critical schedule changes (the summary may strip the event
 * date/time the urgency scorer needs to detect an imminent event).
 */
export function shouldBypassSummaryForPriority(
  subject: string | null | undefined,
  body: string | null | undefined,
): boolean {
  const bodyPreview =
    body?.substring(0, QA_KEYWORD_SCAN.QA_KEYWORD_BODY_SCAN_CHARS) || "";
  return (
    QA_KEYWORD_REGEX.test(subject || "") ||
    QA_KEYWORD_REGEX.test(bodyPreview) ||
    TIME_SENSITIVE_KEYWORD_REGEX.test(subject || "") ||
    TIME_SENSITIVE_KEYWORD_REGEX.test(bodyPreview)
  );
}

/**
 * Builds the per-email payloads sent to the batch priority LLM. QA-related and
 * time-critical emails always use the raw body so the model sees the actual
 * verdict / event date — summaries may strip them.
 */
export function buildBatchEmailPayloads(
  emailsToProcess: Email[],
  threadMap?: Map<string, EmailThread>,
  categoryMap?: Map<string, string>,
): BatchEmailPayload[] {
  return emailsToProcess.map((email) => {
    const bodyForBatch =
      !shouldBypassSummaryForPriority(email.subject, email.body) &&
      email.summary?.trim()
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
      receivedAt: email.receivedAt ?? undefined,
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
