import { Injectable, Logger } from "@nestjs/common";

import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { StructuralError } from "../errors/structural-error";
import {
  PhishingLLMResult,
  PhishingSignals,
  validatePhishingConfidence,
} from "../summarization/phishing-detection.service";
import { convertLocalTimeInZoneToUtc } from "../utils/meeting-time.util";
import { cleanEmailContent } from "./email-content-cleaner";
import { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import {
  LLM_OP_CHECK_PHISHING_ONLY,
  LLM_OP_CONFIRM_PHISHING,
  LLM_OP_SUMMARIZE_EMAIL,
  LLM_OP_SUMMARIZE_EMAIL_BATCH,
  LLM_OP_SUMMARIZE_EMAIL_WITH_PHISHING,
  type LLMOperation,
} from "./llm-operations";
import {
  coerceSummaryFromLlmField,
  extractPlainSummary,
  tryParseJsonObjectFromLlmResponse,
} from "./llm-summary-utils";
import {
  getPrompt,
  renderPrompt,
  SUMMARY_PROMPT_IDS,
  SUMMARY_TYPES,
  SummaryType,
} from "./prompts";

/**
 * Domain service for LLM-powered email summarization (single + thread + phishing).
 * Extracted from LLMService (Phase 7a, issue #939).
 */
@Injectable()
export class LLMSummarizationService {
  private readonly logger = new Logger(LLMSummarizationService.name);

  constructor(private readonly llmCoreService: LLMCoreService) {}

  private async generateText(
    request: {
      prompt: string;
      systemPrompt: string;
      temperature: number;
      maxTokens: number;
      jsonMode?: boolean;
      userId?: string;
      metadata?: Record<string, unknown>;
    },
    provider?: LLMProvider,
    userId?: string,
    operation?: LLMOperation,
  ): Promise<string> {
    const effectiveRequest = operation ? { ...request, operation } : request;
    // Summarisation runs on the cheapest model by default — AWS Bedrock (Amazon
    // Nova Micro). Bedrock failures fall back to Gemini inside the core service.
    // Callers can still pass an explicit provider to override.
    return this.llmCoreService.generateText(
      effectiveRequest,
      provider ?? LLMProvider.BEDROCK,
      userId,
    );
  }

  // eslint-disable-next-line better-max-params/better-max-params
  async summarizeEmail(
    emailBody: string,
    emailSubject: string,
    summaryType: SummaryType,
    provider?: LLMProvider,
    userId?: string,
    userName: string = "",
  ): Promise<string> {
    const isThread =
      emailBody.includes("[Message") && emailBody.includes("---");
    const contextNote = isThread
      ? "This is an email thread with multiple messages. Summarize the entire conversation, focusing on the most recent developments and key points across all messages."
      : "";

    let promptId: string;
    if (
      summaryType === SUMMARY_TYPES.TLDR ||
      summaryType === SUMMARY_TYPES.SENDER_REQUEST
    ) {
      promptId = SUMMARY_PROMPT_IDS.TLDR;
    } else if (summaryType === SUMMARY_TYPES.BULLET_POINTS) {
      promptId = SUMMARY_PROMPT_IDS.BULLETS;
    } else if (summaryType === SUMMARY_TYPES.ACTION_ITEMS) {
      promptId = SUMMARY_PROMPT_IDS.ACTIONS;
    } else {
      throw new StructuralError(
        `summarizeEmail called with summaryType="custom" — custom emails must use the customPrompt path, not a prompt ID`,
      );
    }

    const promptConfig = getPrompt(promptId);
    if (!promptConfig) {
      const expectedFileName = `${promptId.replace(/_/g, "-")}.md`;
      throw new StructuralError(
        `Prompt template not found: ${promptId}. Expected file: ${expectedFileName} in server/promptfoo/prompts/ directory. Please ensure the prompt template file exists.`,
      );
    }

    const cleanedBody = cleanEmailContent(
      emailBody,
      null,
      QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
    );

    const prompt = renderPrompt(promptConfig.prompt || "", {
      isThread,
      subject: emailSubject,
      contextNote: contextNote || "",
      body: cleanedBody,
      userName,
    });

    return await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.HALF,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_SMALL,
        userId,
      },
      provider,
      userId,
      LLM_OP_SUMMARIZE_EMAIL,
    );
  }

  /**
   * Summarize an email AND check for phishing in a single LLM call.
   */
  // eslint-disable-next-line better-max-params/better-max-params
  async summarizeEmailWithPhishingCheck(
    emailBody: string,
    emailSubject: string,
    summaryType: SummaryType,
    phishingSignals: PhishingSignals,
    provider?: LLMProvider,
    userId?: string,
    isUserSender: boolean = false,
    from: string = "",
    fromName: string = "",
    existingActions: string[] = [],
    userTimezone: string = "UTC",
    userName: string = "",
  ): Promise<{
    summary: string;
    phishing: PhishingLLMResult | null;
    sentiment: { score: number; explanation: string } | null;
    actionItems: Array<{ description: string; confidence: number }> | null;
    meetingProposal: {
      hasProposal: boolean;
      proposedTime: string | null;
      proposedTimeText: string | null;
      topic: string | null;
      durationMinutes: number | null;
    } | null;
  }> {
    const isThread =
      emailBody.includes("[Message") && emailBody.includes("---");
    const contextNote = isThread
      ? "This is an email thread with multiple messages. Summarize the entire conversation, focusing on the most recent developments and key points across all messages."
      : "";

    const promptConfig = this.resolvePhishingSummaryPromptConfig(summaryType);

    const cleanedBody = cleanEmailContent(
      emailBody,
      null,
      QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
    );

    const cappedExistingActions = existingActions.slice(
      0,
      QUERY_LIMITS.LLM_EXISTING_ACTIONS_CAP,
    );

    const prompt = renderPrompt(promptConfig.prompt || "", {
      isThread,
      subject: emailSubject,
      contextNote: contextNote || "",
      body: cleanedBody,
      phishingSignals,
      isUserSender,
      from,
      fromName,
      userName,
      hasExistingActions: cappedExistingActions.length > 0,
      existingActions:
        cappedExistingActions.length > 0
          ? cappedExistingActions.join("\n")
          : "",
      currentDatetime: new Date().toISOString(),
      userTimezone,
    });

    const PHISHING_JSON_TOKEN_OVERHEAD = 150;
    // Run the summary and a dedicated phishing check as separate focused prompts
    // (see checkPhishingOnly). The dedicated verdict wins; the summary prompt's
    // own phishing field is the fallback if the check can't be parsed.
    const [response, dedicatedPhishing] = await Promise.all([
      this.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: RATIOS.HALF,
          maxTokens:
            QUERY_LIMITS.LLM_MAX_TOKENS_SMALL + PHISHING_JSON_TOKEN_OVERHEAD,
          jsonMode: true,
          userId,
        },
        provider,
        userId,
        LLM_OP_SUMMARIZE_EMAIL_WITH_PHISHING,
      ),
      this.checkPhishingOnly(
        emailBody,
        emailSubject,
        phishingSignals,
        provider,
        userId,
      ),
    ]);

    const parsed = this.parseSummaryWithPhishing(response);
    return {
      ...parsed,
      phishing: await this.confirmPhishingVerdict({
        verdict: dedicatedPhishing ?? parsed.phishing,
        emailBody,
        emailSubject,
        phishingSignals,
        primaryProvider: provider,
        userId,
      }),
    };
  }

  /**
   * Parse a `{ summary, phishing, sentiment, actionItems, meetingProposal }` JSON response from the LLM.
   */
  parseSummaryWithPhishing(response: string): {
    summary: string;
    phishing: PhishingLLMResult | null;
    sentiment: { score: number; explanation: string } | null;
    actionItems: Array<{ description: string; confidence: number }> | null;
    meetingProposal: {
      hasProposal: boolean;
      proposedTime: string | null;
      proposedTimeText: string | null;
      topic: string | null;
      durationMinutes: number | null;
    } | null;
  } {
    try {
      const parsed = tryParseJsonObjectFromLlmResponse(response);
      if (parsed) {
        const summaryText = coerceSummaryFromLlmField(parsed.summary);
        if (summaryText !== null) {
          const sentiment = this.validateSentimentResult(parsed.sentiment);
          const actionItems = this.validateActionItems(parsed.actionItems);
          const meetingProposal = this.validateMeetingProposal(
            parsed.meetingProposal,
          );
          return {
            summary: summaryText,
            phishing: this.validatePhishingLLMResult(parsed.phishing),
            sentiment,
            actionItems,
            meetingProposal,
          };
        }
      }
    } catch {
      // fall through to plain-text fallback
    }
    return {
      summary: extractPlainSummary(response),
      phishing: null,
      sentiment: null,
      actionItems: null,
      meetingProposal: null,
    };
  }

  validateMeetingProposal(value: unknown): {
    hasProposal: boolean;
    proposedTime: string | null;
    proposedTimeText: string | null;
    topic: string | null;
    durationMinutes: number | null;
  } | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.hasProposal !== "boolean") return null;

    // Prompts now return `proposedLocalTime` (naive wall-clock, no offset) +
    // `proposedTimezone`. We convert to UTC deterministically here rather than
    // trusting the LLM's timezone math. We also tolerate the legacy
    // `proposedTime` field so any in-flight responses from older deploys still
    // produce a usable result.
    const proposedLocalTime =
      typeof raw.proposedLocalTime === "string" ? raw.proposedLocalTime : null;
    const proposedTimezone =
      typeof raw.proposedTimezone === "string" ? raw.proposedTimezone : null;
    const legacyProposedTime =
      typeof raw.proposedTime === "string" ? raw.proposedTime : null;
    const proposedTime =
      convertLocalTimeInZoneToUtc(proposedLocalTime, proposedTimezone) ??
      legacyProposedTime;

    return {
      hasProposal: raw.hasProposal && proposedTime !== null,
      proposedTime,
      proposedTimeText:
        typeof raw.proposedTimeText === "string" ? raw.proposedTimeText : null,
      topic: typeof raw.topic === "string" ? raw.topic : null,
      durationMinutes:
        typeof raw.durationMinutes === "number" ? raw.durationMinutes : null,
    };
  }

  validateActionItems(
    value: unknown,
  ): Array<{ description: string; confidence: number }> | null {
    if (!Array.isArray(value)) return null;
    const items: Array<{ description: string; confidence: number }> = [];
    for (const item of value) {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).description === "string" &&
        typeof (item as Record<string, unknown>).confidence === "number"
      ) {
        items.push({
          description: (item as { description: string }).description,
          confidence: Math.max(
            0,
            Math.min(1, (item as { confidence: number }).confidence),
          ),
        });
      }
    }
    return items.length > 0 ? items : [];
  }

  validateSentimentResult(
    value: unknown,
  ): { score: number; explanation: string } | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    if (typeof raw.score !== "number" || typeof raw.explanation !== "string")
      return null;
    const score = Math.max(-1, Math.min(1, raw.score));
    return { score, explanation: raw.explanation };
  }

  /**
   * Summarize an email using a custom user prompt and append a phishing detection footer.
   */
  // eslint-disable-next-line better-max-params/better-max-params
  async summarizeCustomPromptWithPhishing(
    emailBody: string,
    emailSubject: string,
    customPrompt: string,
    phishingSignals: PhishingSignals,
    isThread: boolean,
    totalMessageCount: number,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<{
    summary: string;
    phishing: PhishingLLMResult | null;
    sentiment: { score: number; explanation: string } | null;
    actionItems: Array<{ description: string; confidence: number }> | null;
    meetingProposal: {
      hasProposal: boolean;
      proposedTime: string | null;
      proposedTimeText: string | null;
      topic: string | null;
      durationMinutes: number | null;
    } | null;
  }> {
    const PHISHING_JSON_TOKEN_OVERHEAD = 300;

    const bodyPreamble = isThread
      ? `Email Thread Subject: ${emailSubject}\n\nThis thread contains ${totalMessageCount} messages. Here are the key messages (first + last few):\n\n${emailBody}\n\n`
      : `Email Subject: ${emailSubject}\n\nEmail Body:\n"""\n${emailBody}\n"""\n\n`;

    const phishingFooter = `---

Return a JSON object (no markdown fences) with exactly these fields:
{
  "summary": "<your answer here>",
  "phishing": <null if clearly legitimate, or { "is_phishing": true|false, "confidence": "low"|"medium"|"high", "reason": "<one sentence>" } if suspicious>,
  "sentiment": { "score": <number from -1.0 (very negative) to 1.0 (very positive), 0 = neutral>, "explanation": "<one sentence describing the tone>" },
  "actionItems": [{ "description": "<task the recipient needs to do>", "confidence": <0.0-1.0> }]
}

PHISHING: Is the email pressuring urgent account action, harvesting credentials, or using a mismatched sender domain to deceive? If uncertain, set is_phishing to false.
SENTIMENT: Score from -1.0 (very negative/threatening) to 0 (neutral) to 1.0 (very positive/excited).`;

    const phishingSignalsText =
      phishingSignals.suspiciousKeywords.length > 0 ||
      phishingSignals.linkedDomains.length > 0
        ? `\n\nKeyword analysis context (use as signals to inform your judgement, not as a verdict):\n- Sender domain: ${phishingSignals.senderDomain ?? "unknown"}\n- Domains linked in body: ${phishingSignals.linkedDomains.join(", ") || "none"}\n- Domain mismatch detected: ${phishingSignals.hasDomainMismatch}\n- Suspicious keywords found: ${phishingSignals.suspiciousKeywords.join(", ") || "none"}`
        : "";

    const fullPrompt = `${bodyPreamble}${customPrompt}\n\n${phishingFooter}${phishingSignalsText}`;

    // Dedicated phishing check runs alongside the custom summary — this is the
    // path where the combined prompt over-flagged legitimate newsletters, so the
    // focused check-phishing-only prompt is authoritative here.
    const [response, dedicatedPhishing] = await Promise.all([
      this.generateText(
        {
          prompt: fullPrompt,
          systemPrompt:
            "You are a helpful assistant that summarizes email threads according to user instructions.",
          temperature: RATIOS.HALF,
          maxTokens:
            QUERY_LIMITS.LLM_MAX_TOKENS_SMALL + PHISHING_JSON_TOKEN_OVERHEAD,
          jsonMode: true,
          userId,
        },
        provider,
        userId,
        LLM_OP_SUMMARIZE_EMAIL_WITH_PHISHING,
      ),
      this.checkPhishingOnly(
        emailBody,
        emailSubject,
        phishingSignals,
        provider,
        userId,
      ),
    ]);

    const parsed = this.parseSummaryWithPhishing(response);
    return {
      ...parsed,
      phishing: await this.confirmPhishingVerdict({
        verdict: dedicatedPhishing ?? parsed.phishing,
        emailBody,
        emailSubject,
        phishingSignals,
        primaryProvider: provider,
        userId,
      }),
    };
  }

  /** Resolve the summary prompt for the summary+phishing path (custom is rejected). */
  private resolvePhishingSummaryPromptConfig(summaryType: SummaryType) {
    let promptId: string;
    if (summaryType === SUMMARY_TYPES.BULLET_POINTS) {
      promptId = SUMMARY_PROMPT_IDS.BULLETS;
    } else if (summaryType === SUMMARY_TYPES.ACTION_ITEMS) {
      promptId = SUMMARY_PROMPT_IDS.ACTIONS;
    } else if (summaryType === SUMMARY_TYPES.CUSTOM) {
      throw new StructuralError(
        `summarizeEmailWithPhishingCheck called with summaryType="${SUMMARY_TYPES.CUSTOM}" — custom prompts must use summarizeCustomPromptWithPhishing()`,
      );
    } else {
      promptId = SUMMARY_PROMPT_IDS.TLDR;
    }
    const promptConfig = getPrompt(promptId);
    if (!promptConfig) {
      const expectedFileName = `${promptId.replace(/_/g, "-")}.md`;
      throw new StructuralError(
        `Prompt template not found: ${promptId}. Expected file: ${expectedFileName} in server/promptfoo/prompts/ directory.`,
      );
    }
    return promptConfig;
  }

  /**
   * Dedicated phishing verdict via a single-job prompt (check-phishing-only.md).
   * Run alongside the summary call so summarisation and phishing detection each
   * get a focused prompt — small models (Nova Micro) follow one-job prompts more
   * reliably than the combined summary+phishing prompt, and this avoids the
   * combined-prompt false positives. Returns null if the check can't be parsed;
   * callers fall back to the summary prompt's own phishing field.
   */
  async checkPhishingOnly(
    emailBody: string,
    emailSubject: string,
    phishingSignals: PhishingSignals,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<PhishingLLMResult | null> {
    const outcome = await this.runPhishingOnlyCheck({
      emailBody,
      emailSubject,
      phishingSignals,
      provider,
      userId,
      operation: LLM_OP_CHECK_PHISHING_ONLY,
    });
    return outcome.ok ? outcome.verdict : null;
  }

  /**
   * Run the check-phishing-only prompt once on the given provider.
   * `ok: false` means the call itself failed (parse error, network, rate limit)
   * — distinct from `ok: true, verdict: null`, which means the model judged the
   * email clearly legitimate. Confirmation logic needs that distinction: an
   * errored confirmation keeps the primary verdict; a legitimate verdict clears it.
   */
  private async runPhishingOnlyCheck(options: {
    emailBody: string;
    emailSubject: string;
    phishingSignals: PhishingSignals;
    provider: LLMProvider | undefined;
    userId: string | undefined;
    operation:
      | typeof LLM_OP_CHECK_PHISHING_ONLY
      | typeof LLM_OP_CONFIRM_PHISHING;
  }): Promise<{ ok: boolean; verdict: PhishingLLMResult | null }> {
    const {
      emailBody,
      emailSubject,
      phishingSignals,
      provider,
      userId,
      operation,
    } = options;
    const promptConfig = getPrompt(SUMMARY_PROMPT_IDS.CHECK_PHISHING_ONLY);
    if (!promptConfig) {
      this.logger.warn(
        "check-phishing-only prompt missing; skipping dedicated phishing check",
      );
      return { ok: false, verdict: null };
    }

    const isThread =
      emailBody.includes("[Message") && emailBody.includes("---");
    const cleanedBody = cleanEmailContent(
      emailBody,
      null,
      QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
    );

    const prompt = renderPrompt(promptConfig.prompt || "", {
      subject: emailSubject,
      contextNote: isThread
        ? "This is an email thread with multiple messages."
        : "",
      body: cleanedBody,
      phishingSignals,
    });

    const PHISHING_ONLY_MAX_TOKENS = 200;
    // Fail-safe: a transient error here (rate limit, network) must NOT fail the
    // whole summary — the caller falls back to the summary prompt's own phishing
    // field when this returns ok: false.
    try {
      const response = await this.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: RATIOS.HALF,
          maxTokens: PHISHING_ONLY_MAX_TOKENS,
          jsonMode: true,
          userId,
        },
        provider,
        userId,
        operation,
      );
      const parsed = tryParseJsonObjectFromLlmResponse(response);
      if (!parsed) return { ok: false, verdict: null };
      return {
        ok: true,
        verdict: this.validatePhishingLLMResult(parsed.phishing),
      };
    } catch (error) {
      this.logger.warn(
        `Dedicated phishing check failed; using summary prompt's phishing field instead: ${(error as Error).message}`,
      );
      return { ok: false, verdict: null };
    }
  }

  /**
   * Second-opinion gate for banner-worthy verdicts. The primary phishing check
   * runs on the cheap prod model (Nova Micro), which over-flags legitimate
   * transactional email. Before a medium/high verdict is allowed to show the
   * phishing banner, re-run the same check on Gemini; a Nova false positive is
   * acceptable because Gemini clears it here. Fail-open: if Gemini is not
   * configured (or the confirmation call fails), the primary verdict stands.
   */
  async confirmPhishingVerdict(options: {
    verdict: PhishingLLMResult | null;
    emailBody: string;
    emailSubject: string;
    phishingSignals: PhishingSignals;
    primaryProvider: LLMProvider | undefined;
    userId?: string;
  }): Promise<PhishingLLMResult | null> {
    const {
      verdict,
      emailBody,
      emailSubject,
      phishingSignals,
      primaryProvider,
      userId,
    } = options;
    if (!verdict?.is_phishing || verdict.confidence === "low") {
      return verdict;
    }
    if (primaryProvider === LLMProvider.GEMINI) {
      // The primary check already ran on the confirmation model.
      return verdict;
    }
    if (
      !this.llmCoreService.getAvailableProviders().includes(LLMProvider.GEMINI)
    ) {
      return verdict;
    }

    const confirmation = await this.runPhishingOnlyCheck({
      emailBody,
      emailSubject,
      phishingSignals,
      provider: LLMProvider.GEMINI,
      userId,
      operation: LLM_OP_CONFIRM_PHISHING,
    });
    if (!confirmation.ok) {
      return verdict;
    }
    if (!confirmation.verdict?.is_phishing) {
      this.logger.log(
        `Phishing verdict cleared by confirmation model (primary said ${verdict.confidence}: ${verdict.reason})`,
      );
    }
    return confirmation.verdict;
  }

  validatePhishingLLMResult(value: unknown): PhishingLLMResult | null {
    if (!value || typeof value !== "object") return null;
    const raw = value as Record<string, unknown>;
    const confidence = validatePhishingConfidence(raw.confidence);
    if (
      typeof raw.is_phishing !== "boolean" ||
      !confidence ||
      typeof raw.reason !== "string"
    ) {
      return null;
    }
    return { is_phishing: raw.is_phishing, confidence, reason: raw.reason };
  }

  // ─── Thread summarization ────────────────────────────────────────────────

  private async summarizeSingleThread(
    thread: { index: number; subject: string; body: string },
    provider: LLMProvider | undefined,
    userId: string | undefined,
    customInstructions: string | undefined,
  ): Promise<Map<number, string>> {
    try {
      let summary: string;
      if (customInstructions) {
        const cleanedBody = cleanEmailContent(
          thread.body,
          null,
          QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
        );
        const prompt = `Thread Subject: ${thread.subject}\n\nThread Content:\n${cleanedBody}\n\n${customInstructions}`;
        summary = extractPlainSummary(
          await this.generateText(
            {
              prompt,
              systemPrompt:
                "You are a helpful assistant that summarizes email threads according to user instructions.",
              temperature: RATIOS.HALF,
              maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_SMALL,
              userId,
            },
            provider,
            userId,
            LLM_OP_SUMMARIZE_EMAIL,
          ),
        );
      } else {
        summary = await this.summarizeEmail(
          thread.body,
          thread.subject,
          SUMMARY_TYPES.TLDR,
          provider,
          userId,
        );
      }
      const result = new Map<number, string>();
      result.set(thread.index, summary);
      return result;
    } catch (error) {
      this.logger.error(`Failed to summarize single thread: ${error}`);
      return new Map();
    }
  }

  private async summarizeThreadsFallback(
    threads: Array<{ index: number; subject: string; body: string }>,
    provider: LLMProvider | undefined,
    userId: string | undefined,
  ): Promise<Map<number, string>> {
    const result = new Map<number, string>();
    for (const thread of threads) {
      try {
        const summary = await this.summarizeEmail(
          thread.body,
          thread.subject,
          SUMMARY_TYPES.TLDR,
          provider,
          userId,
        );
        result.set(thread.index, summary);
      } catch (error) {
        this.logger.warn(
          `Failed to summarize thread ${thread.index}: ${error}`,
        );
      }
    }
    return result;
  }

  private parseBatchSummaryResponse(
    response: string,
    threadsForPrompt: Array<{ index: number }>,
  ): Map<number, string> | null {
    let jsonStr: string | null = null;
    const directMatch = response.match(/\{[\s\S]*\}/);
    if (directMatch) jsonStr = directMatch[0];
    if (!jsonStr) {
      const codeBlockMatch = response.match(
        /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
      );
      if (codeBlockMatch?.[1]) jsonStr = codeBlockMatch[1];
    }
    if (!jsonStr) {
      this.logger.error("Failed to find JSON in batch summarization response");
      return null;
    }
    try {
      const summaries = JSON.parse(jsonStr);
      if (typeof summaries !== "object" || Array.isArray(summaries))
        throw new Error("Response is not a JSON object");
      const result = new Map<number, string>();
      threadsForPrompt.forEach((thread) => {
        const summary =
          summaries[thread.index] || summaries[String(thread.index)];
        if (
          summary &&
          typeof summary === "string" &&
          summary.trim().length > 0
        ) {
          result.set(thread.index, summary.trim());
        } else {
          this.logger.warn(
            `Missing summary for thread index ${thread.index} in batch response`,
          );
        }
      });
      return result;
    } catch (parseError) {
      this.logger.error(
        "Failed to parse JSON from batch summarization response:",
        parseError,
      );
      return null;
    }
  }

  async summarizeThreads(
    threads: Array<{
      index: number;
      subject: string;
      body: string;
      isThread: boolean;
      messageCount?: number;
    }>,
    provider?: LLMProvider,
    userId?: string,
    customInstructions?: string,
    emailIds?: string[],
  ): Promise<Map<number, string>> {
    if (threads.length === 0) return new Map();
    if (threads.length === 1) {
      return this.summarizeSingleThread(
        threads[0],
        provider,
        userId,
        customInstructions,
      );
    }

    const promptConfig = getPrompt(SUMMARY_PROMPT_IDS.BATCH);
    if (!promptConfig) {
      this.logger.error(
        "summarize_email_batch prompt not found - falling back to individual calls",
      );
      return this.summarizeThreadsFallback(threads, provider, userId);
    }

    const threadsForPrompt = threads.map((thread) => ({
      index: thread.index,
      subject: thread.subject,
      body: cleanEmailContent(
        thread.body,
        null,
        QUERY_LIMITS.LLM_MAX_TOKENS_LARGE,
      ),
      isThread: thread.isThread,
      messageCount: thread.messageCount || 1,
    }));

    const prompt = renderPrompt(promptConfig.prompt || "", {
      emails: threadsForPrompt,
      customInstructions: customInstructions || null,
    });

    try {
      const response = await this.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: RATIOS.HALF,
          maxTokens: Math.min(
            QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH * 2,
            threads.length * QUERY_LIMITS.LLM_MAX_TOKENS_VERY_SMALL +
              QUERY_LIMITS.LLM_MAX_TOKENS_EXPLANATION,
          ),
          jsonMode: true,
          userId,
          metadata: emailIds?.length ? { emailIds } : undefined,
        },
        provider,
        userId,
        LLM_OP_SUMMARIZE_EMAIL_BATCH,
      );

      const result = this.parseBatchSummaryResponse(response, threadsForPrompt);
      if (result) {
        this.logger.log(
          `Thread summarization complete: ${result.size}/${threads.length} summaries generated`,
        );
        return result;
      }
    } catch (error) {
      this.logger.error("Batch summarization failed", error);
    }
    return new Map();
  }
}
