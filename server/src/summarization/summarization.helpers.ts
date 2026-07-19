/**
 * Pure helper functions extracted from SummarizationService to stay within
 * per-file line limits. These functions have no class dependencies — all
 * inputs are passed explicitly.
 */

import { QUERY_LIMITS } from "../constants/query-limits";
import { SummarizationRule as SummarizationRuleEntity } from "../database/entities/summarization-rule.entity";
import { cleanEmailForThread } from "../llm/email-content-cleaner";
import { LLMService } from "../llm/llm.service";
import { logWarn } from "../utils/logger";
import {
  extractPhishingSignals,
  mergePhishingSignalSets,
  PhishingSignals,
} from "./phishing-detection.service";
import { EmailWithHtmlBody, SummaryDebugInfo } from "./summarization.types";

/**
 * Builds the admin debug payload describing which emails were fed to the LLM
 * for a summary. Extracted to keep summarizeEmailWithPhishing within length limits.
 */
export function buildSummaryDebug(
  threadId: string,
  allThreadEmails: Array<unknown>,
  messagesToSummarize: Array<{
    id: string;
    from?: string;
    receivedAt?: Date | string;
  }>,
): SummaryDebugInfo {
  return {
    threadId,
    totalThreadEmails: allThreadEmails.length,
    usedEmailIds: messagesToSummarize.map((message) => message.id),
    usedMessages: messagesToSummarize.map((message) => {
      const parsed =
        message.receivedAt !== undefined && message.receivedAt !== null
          ? new Date(message.receivedAt)
          : null;
      const receivedAt =
        parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : "";
      return {
        id: message.id,
        from: message.from ?? "",
        receivedAt,
      };
    }),
  };
}

/**
 * Build a cache key for phishing results based on sender + subject.
 */
export function buildPhishingCacheKey(
  from: string | undefined,
  subject: string | undefined,
): string {
  const partLen = QUERY_LIMITS.PHISHING_CACHE_KEY_PART_LENGTH;
  return `${(from ?? "").slice(0, partLen)}::${(subject ?? "").slice(0, partLen)}`;
}

/**
 * Derive combined phishing signals from all emails in a thread.
 * These signals are passed as context to the LLM — they are NOT used as a standalone
 * phishing verdict. Only the LLM can produce a phishing verdict.
 */
export function buildPhishingContext(
  allThreadEmails: Array<{ from?: string; body?: string | null }>,
): {
  phishingSignals: PhishingSignals;
} {
  const emptySignals: PhishingSignals = {
    hasDomainMismatch: false,
    senderDomain: null,
    linkedDomains: [],
    suspiciousKeywords: [],
    rawScore: 0,
  };
  const phishingSignals = allThreadEmails.reduce(
    (merged, threadEmail) =>
      mergePhishingSignalSets(
        merged,
        extractPhishingSignals(threadEmail.from, threadEmail.body ?? ""),
      ),
    emptySignals,
  );
  return { phishingSignals };
}

/**
 * Use the LLM to pick which summarisation rule best matches an email.
 * Returns the matching rule, null (no match), or undefined (LLM returned
 * an unrecognised value — caller should fall back).
 */
export async function matchRuleWithLLM(
  email: { subject?: string; from?: string; fromName?: string },
  cleanedBody: string,
  rules: SummarizationRuleEntity[],
  userId: string,
  llmService: Pick<LLMService, "generateText">,
): Promise<SummarizationRuleEntity | null | undefined> {
  const previewLen = QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH;
  const emailPreview = cleanedBody.substring(0, previewLen);
  const ellipsis =
    cleanedBody.length > previewLen ? "\n\n[... email continues ...]" : "";
  const emailText = [
    `Subject: ${email.subject || "(no subject)"}`,
    `From: ${email.fromName || email.from || "(unknown sender)"} <${email.from || ""}>`,
    ``,
    `Email Body:`,
    `"""`,
    `${emailPreview}${ellipsis}`,
    `"""`,
  ].join("\n");

  const ruleDescriptions = rules
    .map((rule, index) => `Rule ${index + 1}: "${rule.whenToUse}"`)
    .join("\n");

  const prompt = `You are evaluating which summarization rule should be applied to an email based on the "whenToUse" criteria for each rule.

Email to evaluate:
${emailText}

Available summarization rules (each has a "whenToUse" description that explains when it should be applied):
${ruleDescriptions}

Your task:
1. Carefully read the "whenToUse" criteria for each rule
2. Determine if the email matches any of the rules based on their "whenToUse" descriptions
3. Consider the email's subject, sender, and content when evaluating matches
4. If the email clearly matches a rule's "whenToUse" criteria, return that rule's number (1-${rules.length})
5. If no rule clearly matches, return "0"

Examples:
- If a rule says "Github emails" and the email is from GitHub (e.g., notifications@github.com, noreply@github.com) or contains GitHub-related content, it matches
- If a rule says "emails from @company.com" and the sender's domain is company.com, it matches
- If a rule says "newsletter emails" and the email is clearly a newsletter, it matches

Respond with ONLY the rule number (1-${rules.length}) or "0" if no match. Do not include any explanation or other text.`;

  const response = await llmService.generateText(
    {
      prompt,
      systemPrompt:
        "You are a precise assistant that evaluates whether emails match rule criteria. You respond with only a number: the rule number (1-N) if a match is found, or 0 if no rule matches.",
      temperature: 0.1,
      maxTokens: 5,
      userId,
    },
    undefined,
    userId,
  );

  const cleanedResponse = response.trim().replace(/[^0-9]/g, "");
  const ruleIndex = parseInt(cleanedResponse, 10) - 1;

  if (ruleIndex >= 0 && ruleIndex < rules.length) {
    return rules[ruleIndex];
  }
  if (cleanedResponse === "0") {
    return null;
  }

  logWarn(
    `LLM returned invalid rule index: "${response.trim()}", parsed as: ${ruleIndex}`,
  );
  return undefined;
}

/**
 * Extracts the bare email address from a "Name <email>" or plain "email" string.
 */
function extractEmailAddress(from: string | undefined): string {
  if (!from) return "";
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].toLowerCase();
  return from.toLowerCase().trim();
}

/**
 * Returns true when the email was sent by the inbox owner (identified by
 * their plain email address).
 */
export function isEmailFromUser(
  emailFrom: string | undefined,
  userEmail: string,
): boolean {
  if (!userEmail || !emailFrom) return false;
  const senderEmail = extractEmailAddress(emailFrom);
  return senderEmail === userEmail;
}

/**
 * Formats a list of messages into a single readable block for LLM summarisation.
 * Shows the full thread in chronological order.
 */
export function buildThreadText(
  messagesToSummarize: Array<{
    body: string;
    fromName?: string;
    from?: string;
    receivedAt: Date | string;
  }>,
  allThreadEmails: Array<unknown>,
  userEmail: string = "",
): string {
  return messagesToSummarize
    .map((emailEntry, idx) => {
      const emailWithHtml = emailEntry as EmailWithHtmlBody;
      const isFromUser = isEmailFromUser(emailEntry.from, userEmail);
      const sender = isFromUser
        ? "You"
        : emailEntry.fromName || emailEntry.from;
      const date = new Date(emailEntry.receivedAt).toLocaleString();
      const cleanedBody = cleanEmailForThread(
        emailEntry.body,
        emailWithHtml.htmlBody,
      );
      const messageLabel =
        idx === 0 && allThreadEmails.length > 1
          ? "Original"
          : `Message ${idx + 1}`;
      return `[${messageLabel} from ${sender} on ${date}]:\n"""\n${cleanedBody}\n"""`;
    })
    .join("\n\n---\n\n");
}
