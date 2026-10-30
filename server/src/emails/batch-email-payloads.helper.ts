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
 * True once a priority writer (worker LLM, Lambda, deterministic rule or local
 * model) has actually scored the thread — only then is there an existing
 * analysis for the cheap batch triage to preserve. `urgencyScore` and
 * `priorityScore` can't be the signal: both default to 0 on a brand-new thread,
 * which used to route every onboarding email through triage, where "no
 * reanalysis needed" left it unscored. A bare `priorityExplanation` isn't
 * either: viewing the priority tooltip before analysis persists a
 * "Calculating..." placeholder. Every real writer stamps `calculatedAt`;
 * `prioritySource` also covers server-scored rows.
 */
export function hasPriorityAnalysis(
  thread: EmailThread | undefined,
): thread is EmailThread {
  if (!thread) return false;
  return (
    thread.prioritySource != null ||
    Boolean(thread.priorityExplanation?.calculatedAt)
  );
}

/**
 * Builds the per-email payloads sent to the batch priority LLM. QA-related and
 * time-critical emails always use the raw body so the model sees the actual
 * verdict / event date — summaries may strip them.
 *
 * Emails in `forceFullAnalysisEmailIds` are sent WITHOUT the thread's existing
 * urgency/category, so the analyser skips its cheap triage pass for them and
 * runs the full analysis. Triage would otherwise "preserve" a thread whose
 * stale rule label was just released, leaving the wrong category in place.
 */
export function buildBatchEmailPayloads(
  emailsToProcess: Email[],
  threadMap?: Map<string, EmailThread>,
  categoryMap?: Map<string, string>,
  forceFullAnalysisEmailIds?: ReadonlySet<string>,
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
      threadMap &&
      email.emailThreadId &&
      !forceFullAnalysisEmailIds?.has(email.id)
        ? threadMap.get(email.emailThreadId)
        : undefined;
    // Never-analysed threads omit both "existing" fields so they skip triage
    // and go straight to full analysis.
    const analysedThread = hasPriorityAnalysis(thread) ? thread : undefined;
    return {
      emailKey: email.id,
      from: email.from || "",
      fromName: email.fromName,
      senderJobTitle: email.senderJobTitle,
      subject: email.subject || "",
      body: bodyForBatch,
      receivedAt: email.receivedAt ?? undefined,
      preComputedSentimentScore: email.sentimentScore ?? undefined,
      existingUrgencyScore: analysedThread?.urgencyScore ?? undefined,
      existingCategory:
        analysedThread?.categoryId && categoryMap
          ? categoryMap.get(analysedThread.categoryId)
          : undefined,
    };
  });
}
