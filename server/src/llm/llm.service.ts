import { Injectable, Logger } from "@nestjs/common";
import { cleanEmailContent } from "./email-content-cleaner";
import { getPrompt, renderPrompt } from "./prompts";
import { StructuralError } from "../errors/structural-error";
import {
  LLMOperation,
  LLM_OP_ANALYZE_EMAIL_PATTERNS,
  LLM_OP_SUMMARIZE_EMAIL,
  LLM_OP_SUMMARIZE_EMAIL_BATCH,
  LLM_OP_CHECK_TONE,
  LLM_OP_EXTRACT_ACTION_ITEMS,
  LLM_OP_SUGGEST_ACTIONS,
  LLM_OP_GENERATE_REPLY,
  LLM_OP_GENERATE_REPLY_OPTIONS,
  LLM_OP_GENERATE_MEETING_REPLY,
  LLM_OP_GENERATE_FOLLOW_UP,
  LLM_OP_ANALYZE_OVERRIDE_REASON,
  LLM_OP_EXTRACT_QANDA,
  LLM_OP_SEARCH_RELEVANCE,
  LLM_OP_SEARCH_RELEVANCE_BATCH,
  LLM_OP_REDACT_NAMES,
  LLM_OP_VALIDATE_WRITING_EXAMPLE,
  LLM_OP_DISPUTE_TONE_CHECK,
  LLM_OP_CONSOLIDATE_CATEGORIES,
  LLM_OP_GENERATE_CATEGORIES_FROM_OTHER,
  LLM_OP_IDENTIFY_CUSTOM_LABELS,
} from "./llm-operations";
import { getErrorMessage } from "../types/common";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MINUTES, MILLISECONDS } from "../constants/time-constants";
import {
  TIME_FORMATTING,
  RECENCY_THRESHOLDS,
  QA_EXTRACTION,
  BODY_PREVIEW_LENGTHS,
  CONTEXT_ANALYSIS,
} from "../constants/llm-constants";
import { LLMCoreService } from "./llm-core.service";
import { LLMProvider } from "./llm.types";
import type { LLMRequest } from "./llm.types";
// Re-export LLMProvider for backward compatibility with existing callers
export { LLMProvider };

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);

  constructor(private llmCoreService: LLMCoreService) {}

  async generateText(
    request: LLMRequest,
    provider?: LLMProvider,
    userId?: string,
    operation?: LLMOperation,
  ): Promise<string> {
    const effectiveRequest = operation ? { ...request, operation } : request;
    return this.llmCoreService.generateText(effectiveRequest, provider, userId);
  }

  // eslint-disable-next-line max-lines-per-function, complexity, max-statements
  async analyzeEmailPatterns(
    receivedEmails: Array<{
      from: string;
      fromName?: string;
      subject: string;
      body: string;
      receivedAt: string;
      isRead?: boolean;
      // Time to reply in minutes
      timeToReply?: number | null;
      readAt?: string | null;
      repliedAt?: string | null;
      starCount?: number;
      isArchived?: boolean;
    }>,
    sentEmails: Array<{
      // Optional email ID for linking
      emailId?: string;
      to: string;
      subject: string;
      body: string;
      sentAt: string;
    }>,
    provider?: LLMProvider,
    userId?: string,
    userEmail?: string,
    currentContext?: Array<{ key: string; value: string; source?: string }>,
  ): Promise<{
    context: Array<{ key: string; value: string; source: string }>;
    writingStyle: {
      tone: string;
      style: string;
      commonPhrases: string[];
      emailExamples?: string[];
    };
  }> {
    // Load prompt from markdown file - NO hardcoded prompts!
    const promptConfig = getPrompt("analyze_email_patterns");
    if (!promptConfig) {
      this.logger.error(
        "analyze_email_patterns prompt not found in markdown files - cannot analyze patterns",
      );
      return {
        context: [],
        writingStyle: {
          tone: "Professional",
          style: "Concise",
          commonPhrases: [],
        },
      };
    }

    // Prepare data for LLM (limit size)
    // Include read status, archive status, star status, and timeToReply to infer user behavior
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] Preparing data: ${receivedEmails.length} received threads/emails provided`,
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] Using ALL ${receivedEmails.length} items (not limiting to ${QUERY_LIMITS.MAX_RESULTS_DEFAULT})`,
    );

    const receivedData = receivedEmails
      // Use all threads/emails provided (no artificial limit)
      .map((e) => {
        // Use timeToReply if available (in minutes), otherwise calculate from repliedAt
        const replyTimeMinutes =
          e.timeToReply ??
          (e.repliedAt
            ? (new Date(e.repliedAt).getTime() -
                new Date(e.receivedAt).getTime()) /
              MILLISECONDS.SECOND /
              MINUTES.HOUR
            : null);
        const readStatus = e.isRead ? "Read" : "Unread";
        const archiveStatus = e.isArchived ? "Archived" : "InInbox";
        const starStatus =
          (e.starCount || 0) > 0 ? `Starred(${e.starCount})` : "NotStarred";
        let behavior: string;
        if (e.isArchived && !e.isRead) {
          behavior = "ArchivedWithoutReading";
        } else if (e.isRead && !e.isArchived) {
          behavior = "ReadButKept";
        } else if (e.isRead && e.isArchived) {
          behavior = "ReadThenArchived";
        } else {
          behavior = "UnreadInInbox";
        }
        const replyInfo =
          replyTimeMinutes !== null
            ? `${replyTimeMinutes.toFixed(0)}m`
            : "NoReply";
        const isQuickReply =
          replyTimeMinutes !== null &&
          replyTimeMinutes < QUERY_LIMITS.LLM_QUICK_REPLY_MINUTES;
        return `From: ${e.fromName || e.from}, Subject: ${e.subject}, Read: ${readStatus}, ${archiveStatus}, ${starStatus}, Behavior: ${behavior}, ReplyTime: ${replyInfo}${isQuickReply ? " (QUICK)" : ""}`;
      })
      .join("\n");

    // Include full email body for writing style analysis (redacted for privacy in actual usage)
    // Extract longer examples (full emails) instead of just phrases
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] Preparing sent emails: ${sentEmails.length} sent emails provided, will use first ${QUERY_LIMITS.LLM_SENT_EMAILS_LIMIT}`,
    );

    const sentData = sentEmails
      .slice(0, QUERY_LIMITS.LLM_SENT_EMAILS_LIMIT)
      .map((e) => {
        const cleanBody = cleanEmailContent(
          e.body,
          null,
          QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
        );
        return `To: ${e.to}, Subject: ${e.subject}\nFull Email Body:\n${cleanBody}\n---`;
      })
      .join("\n\n");

    // Analyze times of day for read/response patterns
    const receivedHours: number[] = [];
    const replyHours: number[] = [];

    receivedEmails.forEach((e) => {
      if (e.receivedAt) {
        receivedHours.push(new Date(e.receivedAt).getHours());
      }
      if (e.timeToReply !== null && e.timeToReply < MINUTES.DAY) {
        // Replies within 24 hours
        const received = new Date(e.receivedAt);
        const replyMinutes = e.timeToReply;
        const replyTime = new Date(
          received.getTime() + replyMinutes * MILLISECONDS.MINUTE,
        );
        replyHours.push(replyTime.getHours());
      }
    });

    const timeAnalysis = {
      receivedHours:
        receivedHours.length > 0 ? this.getTimePattern(receivedHours) : null,
      replyHours:
        replyHours.length > 0 ? this.getTimePattern(replyHours) : null,
    };

    // Format current context for the prompt
    const currentContextText =
      currentContext && currentContext.length > 0
        ? currentContext
            .map(
              (ctx) =>
                `- ${ctx.key}: ${ctx.value}${ctx.source ? ` (source: ${ctx.source})` : ""}`,
            )
            .join("\n")
        : "No existing context.";

    // The markdown file contains the full prompt template with {{variables}}
    const timeAnalysisText =
      timeAnalysis.receivedHours || timeAnalysis.replyHours
        ? `\n\nTime Patterns:\n- Email reading times: ${timeAnalysis.receivedHours || "Not enough data"}\n- Email reply times: ${timeAnalysis.replyHours || "Not enough data"}`
        : "";

    const renderedPrompt = renderPrompt(promptConfig.prompt || "", {
      userEmail: userEmail || "unknown@example.com",
      currentContext: currentContextText,
      receivedEmails: receivedData,
      sentEmails: sentData,
      timeAnalysis: timeAnalysisText,
    });

    // Use the full prompt as the user message (markdown contains all instructions)
    const prompt = renderedPrompt;
    const systemPrompt = "";

    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] About to call generateText() - prompt length: ${prompt.length} chars`,
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] Input: ${receivedEmails.length} received emails, ${sentEmails.length} sent emails`,
    );
    const llmCallStart = Date.now();

    const response = await this.generateText(
      {
        prompt,
        systemPrompt,
        temperature: RATIOS.FORTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_LARGE,
        userId,
      },
      provider,
      userId,
      LLM_OP_ANALYZE_EMAIL_PATTERNS,
    );

    const llmCallDuration = Date.now() - llmCallStart;
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] generateText() completed in ${llmCallDuration}ms (${(llmCallDuration / 1000).toFixed(2)}s)`,
    );
    this.logger.log(
      `[CONTEXT-ANALYSIS] [LLM] Response length: ${response.length} chars`,
    );

    try {
      // Handle markdown code blocks if present
      let jsonString = response;
      jsonString = jsonString
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        // Ensure required structure
        return {
          context: Array.isArray(parsed.context) ? parsed.context : [],
          writingStyle:
            parsed.writingStyle && typeof parsed.writingStyle === "object"
              ? {
                  tone: parsed.writingStyle.tone || "Professional",
                  style: parsed.writingStyle.style || "Concise",
                  commonPhrases: Array.isArray(
                    parsed.writingStyle.commonPhrases,
                  )
                    ? parsed.writingStyle.commonPhrases
                    : [],
                  emailExamples: Array.isArray(
                    parsed.writingStyle.emailExamples,
                  )
                    ? parsed.writingStyle.emailExamples
                    : undefined,
                }
              : { tone: "Professional", style: "Concise", commonPhrases: [] },
        };
      }
    } catch (error) {
      this.logger.warn("Failed to parse LLM analysis response as JSON", error);
    }

    // Fallback
    return {
      context: [],
      writingStyle: {
        tone: "Professional",
        style: "Concise",
        commonPhrases: [],
        emailExamples: [],
      },
    };
  }

  async summarizeEmail(
    emailBody: string,
    emailSubject: string,
    summaryType:
      | "tldr"
      | "bullet-points"
      | "action-items"
      | "sender-request"
      | "custom",
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string> {
    // Check if this is a thread (contains multiple messages)
    const isThread =
      emailBody.includes("[Message") && emailBody.includes("---");
    const contextNote = isThread
      ? "This is an email thread with multiple messages. Summarize the entire conversation, focusing on the most recent developments and key points across all messages."
      : "";

    let promptId: string;
    if (summaryType === "tldr") {
      promptId = "summarize_email_tldr";
    } else if (summaryType === "bullet-points") {
      promptId = "summarize_email_bullets";
    } else if (summaryType === "action-items") {
      promptId = "summarize_email_actions";
    } else {
      // For "sender-request" and "custom", fall back to tldr format
      promptId = "summarize_email_tldr";
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
   * Summarize multiple threads with parallel LLM calls.
   * Each thread gets its own LLM call, but calls are fired concurrently for efficiency.
   * @param threads Array of thread content to summarize (body contains combined thread messages)
   * @param provider Optional LLM provider override
   * @param userId Optional user ID for API key
   * @param customInstructions Optional custom summarization instructions from user-defined rules
   * @param emailIds Optional array of email IDs for tracking duplicate summarizations
   * @returns Map of thread index to summary string
   */
  async summarizeThreads(
    threads: Array<{
      index: number;
      subject: string;
      // Combined thread content (first + last 3 messages)
      body: string;
      isThread: boolean;
      messageCount?: number;
    }>,
    provider?: LLMProvider,
    userId?: string,
    customInstructions?: string,
    emailIds?: string[],
  ): Promise<Map<number, string>> {
    if (threads.length === 0) {
      return new Map();
    }

    // If only one thread, use the regular method (more efficient prompt)
    if (threads.length === 1) {
      const thread = threads[0];
      try {
        let summary: string;
        if (customInstructions) {
          // Use custom instructions as a direct prompt
          const cleanedThreadBody = cleanEmailContent(
            thread.body,
            null,
            QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
          );
          const prompt = `Thread Subject: ${thread.subject}\n\nThread Content:\n${cleanedThreadBody}\n\n${customInstructions}`;
          summary = await this.generateText(
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
          );
        } else {
          summary = await this.summarizeEmail(
            thread.body,
            thread.subject,
            "tldr",
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

    const promptConfig = getPrompt("summarize_email_batch");
    if (!promptConfig) {
      this.logger.error(
        "summarize_email_batch prompt not found - falling back to individual calls",
      );
      // Fallback: summarize each thread individually
      const result = new Map<number, string>();
      for (const thread of threads) {
        try {
          const summary = await this.summarizeEmail(
            thread.body,
            thread.subject,
            "tldr",
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

    // Prepare thread data for the prompt (limit body length to save tokens)
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
      emails: threadsForPrompt, // Note: prompt template uses 'emails' variable name
      customInstructions: customInstructions || null,
    });

    try {
      const response = await this.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: RATIOS.HALF,
          // Increase tokens for batch response: ~150 tokens per summary
          maxTokens: Math.min(
            QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH * 2,
            threads.length * QUERY_LIMITS.LLM_MAX_TOKENS_VERY_SMALL + 200,
          ),
          userId,
          // Track email IDs for duplicate summarization detection
          metadata: emailIds?.length ? { emailIds } : undefined,
        },
        provider,
        userId,
        LLM_OP_SUMMARIZE_EMAIL_BATCH,
      );

      // Parse JSON response
      let jsonStr: string | null = null;

      // Try 1: Direct JSON object
      const directMatch = response.match(/\{[\s\S]*\}/);
      if (directMatch) {
        jsonStr = directMatch[0];
      }

      // Try 2: JSON in markdown code block
      if (!jsonStr) {
        const codeBlockMatch = response.match(
          /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
        );
        if (codeBlockMatch && codeBlockMatch[1]) {
          jsonStr = codeBlockMatch[1];
        }
      }

      if (jsonStr) {
        try {
          const summaries = JSON.parse(jsonStr);

          if (typeof summaries !== "object" || Array.isArray(summaries)) {
            throw new Error("Response is not a JSON object");
          }

          const result = new Map<number, string>();

          // Map summaries by index
          threadsForPrompt.forEach((thread) => {
            const summary =
              summaries[thread.index] ||
              summaries[String(thread.index)] ||
              summaries[thread.index.toString()];

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

          this.logger.log(
            `Thread summarization complete: ${result.size}/${threads.length} summaries generated`,
          );

          return result;
        } catch (parseError) {
          this.logger.error(
            `Failed to parse JSON from batch summarization response:`,
            parseError,
          );
        }
      } else {
        this.logger.error(
          `Failed to find JSON in batch summarization response`,
        );
      }
    } catch (error) {
      this.logger.error("Batch summarization failed", error);
    }

    // Fallback: return empty map (will trigger individual calls if needed)
    return new Map();
  }

  async checkTone(
    text: string,
    rules: string[] = ["Be concise", "Use non-violent communication"],
    provider?: LLMProvider,
    userId?: string,
  ): Promise<{ isOk: boolean; suggestions: string[]; revisedText?: string }> {
    const promptConfig = getPrompt("check_tone_style");
    if (!promptConfig) {
      this.logger.error(
        "check_tone_style prompt not found in markdown files - cannot check tone",
      );
      throw new Error("Tone checking prompt not available");
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      rules,
      text,
    });

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: 800,
        userId,
      },
      provider,
      userId,
      LLM_OP_CHECK_TONE,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM tone check response as JSON",
        error,
      );
    }

    return { isOk: true, suggestions: [] };
  }

  async extractActionItems(
    emailBody: string,
    provider?: LLMProvider,
    userId?: string,
    senderInfo?: { from: string; fromName?: string },
    recipientInfo?: { name?: string; email?: string },
    isUserSender: boolean = false,
  ): Promise<Array<{ description: string; confidence: number }>> {
    // Clean email body: strip HTML, remove signatures, limit to 2000 chars
    const cleanedBody = cleanEmailContent(
      emailBody,
      null,
      QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
    );

    // Load prompt from markdown file - NO hardcoded prompts!
    const promptConfig = getPrompt("extract_action_items");
    if (!promptConfig) {
      this.logger.error(
        "extract_action_items prompt not found in markdown files - cannot extract action items",
      );
      return [];
    }

    // The markdown file contains the full prompt template with {{variables}}
    const fullPrompt = renderPrompt(promptConfig.prompt || "", {
      body: cleanedBody,
      from: senderInfo?.from || "Unknown",
      fromName: senderInfo?.fromName || senderInfo?.from || "Unknown",
      recipientName: recipientInfo?.name || "You",
      recipientEmail: recipientInfo?.email || "",
      isUserSender,
      // Pass boolean directly for {{#if}} condition
      perspective: isUserSender ? "SENDER" : "RECIPIENT",
    });

    // Use the full prompt as the user message (markdown contains all instructions)
    const prompt = fullPrompt;
    const systemPrompt = "";

    const response = await this.generateText(
      {
        prompt,
        systemPrompt,
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: 800,
        userId,
      },
      provider,
      userId,
      LLM_OP_EXTRACT_ACTION_ITEMS,
    );

    try {
      // Handle markdown code blocks if present
      let jsonString = response;
      jsonString = jsonString
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.actionItems || [];
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM action items response as JSON",
        error,
      );
    }

    return [];
  }

  // eslint-disable-next-line max-lines-per-function
  async detectSuggestedActions(
    emailContent: {
      subject: string;
      body: string;
      htmlBody?: string;
      from: string;
      fromName?: string;
    },
    emailMetadata?: {
      hasGithubLinks?: boolean;
      githubLinks?: Array<{
        type: string;
        owner: string;
        repo: string;
        number: number;
      }>;
      hasCalendarToken?: boolean;
      hasGithubToken?: boolean;
    },
    provider?: LLMProvider,
    userId?: string,
  ): Promise<
    Array<{
      type: string;
      confidence: number;
      reason: string;
      metadata?: Record<string, unknown>;
    }>
  > {
    // Clean email body: strip HTML, remove signatures, limit to 1000 chars
    const cleanedBody = cleanEmailContent(
      emailContent.body,
      emailContent.htmlBody || null,
      1000, // Reduced from 2000 to save tokens
    );

    const promptConfig = getPrompt("suggest_actions");
    if (!promptConfig) {
      this.logger.error(
        "suggest_actions prompt not found in markdown files - cannot suggest actions",
      );
      return [];
    }

    const githubContext = emailMetadata?.hasGithubLinks
      ? `\n\nNote: This email contains GitHub links: ${JSON.stringify(emailMetadata.githubLinks)}`
      : "";

    const availableIntegrations = [];
    if (emailMetadata?.hasGithubToken) availableIntegrations.push("GitHub");
    if (emailMetadata?.hasCalendarToken) availableIntegrations.push("Calendar");

    const integrationsNote =
      availableIntegrations.length > 0
        ? `\n\nAvailable integrations: ${availableIntegrations.join(", ")}`
        : "";

    const prompt = renderPrompt(promptConfig.prompt || "", {
      subject: emailContent.subject,
      fromName: emailContent.fromName || emailContent.from,
      githubContext: githubContext || "",
      integrationsNote: integrationsNote || "",
      body: cleanedBody,
    });

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        userId,
      },
      provider,
      userId,
      LLM_OP_SUGGEST_ACTIONS,
    );

    try {
      // Handle markdown code blocks if present
      let jsonString = response;
      jsonString = jsonString
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const actions = parsed.actions || [];
        // Filter by confidence and only include actions for available integrations
        return actions.filter(
          (action: {
            confidence: number;
            type?: string;
            [key: string]: unknown;
          }) => {
            if (action.confidence < RATIOS.SEVENTY_PERCENT) return false;
            // Only show GitHub actions if token is available
            if (
              action.type.startsWith("github_") &&
              !emailMetadata?.hasGithubToken
            ) {
              return false;
            }
            // Only show Calendar actions if token is available
            if (
              action.type.startsWith("calendar_") &&
              !emailMetadata?.hasCalendarToken
            ) {
              return false;
            }
            return true;
          },
        );
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM suggested actions response as JSON",
        error,
      );
    }

    return [];
  }

  async generateReplyOptions(
    originalEmail: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    },
    userContext: {
      tone?: string;
      writingStyle?: string;
      userName?: string;
      userJobTitle?: string;
      emailExamples?: string[];
    },
    provider?: LLMProvider,
    userId?: string,
  ): Promise<Array<{ label: string; text: string }>> {
    // Clean email body: strip HTML, remove signatures, limit to 1000 chars
    const cleanedBody = cleanEmailContent(originalEmail.body, null, 1000);

    const promptConfig = getPrompt("generate_multiple_replies");
    if (!promptConfig) {
      this.logger.error(
        "generate_multiple_replies prompt not found in markdown files - cannot generate multiple replies",
      );
      // Fallback: return single generic draft
      const fallbackDraft = await this.generateReplyDraft(
        originalEmail,
        userContext,
        provider,
        userId,
      );
      return [{ label: "Draft Reply", text: fallbackDraft }];
    }

    const tone = userContext.tone || "professional";
    const userName = userContext.userName || "User";
    const userJobTitle = userContext.userJobTitle || "";
    const emailExamples = userContext.emailExamples?.slice(0, 5) || [];

    if (emailExamples.length > 0) {
      this.logger.debug(
        `[generateReplyOptions] Using ${emailExamples.length} email examples for reply generation`,
      );
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      tone,
      userName,
      userJobTitle,
      emailExamples,
      fromName: originalEmail.fromName || originalEmail.from,
      subject: originalEmail.subject,
      body: cleanedBody,
    });

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.SEVENTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        userId,
      },
      provider,
      userId,
      LLM_OP_GENERATE_REPLY_OPTIONS,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.options || [];
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM reply options response as JSON",
        error,
      );
    }

    // Fallback: return single generic draft if JSON parsing fails
    const fallbackDraft = await this.generateReplyDraft(
      originalEmail,
      userContext,
      provider,
      userId,
    );
    return [{ label: "Draft Reply", text: fallbackDraft }];
  }

  async generateReplyDraft(
    originalEmail: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    },
    userContext: {
      tone?: string;
      commonPhrases?: string[];
      writingStyle?: string;
      emailExamples?: string[];
    },
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string> {
    // Clean email body: strip HTML, remove signatures, limit to 1000 chars
    const cleanedBody = cleanEmailContent(originalEmail.body, null, 1000);

    const promptConfig = getPrompt("generate_reply");
    if (!promptConfig) {
      this.logger.error(
        "generate_reply prompt not found in markdown files - cannot generate reply",
      );
      throw new Error("Reply generation prompt not available");
    }

    const tone = userContext.tone || "professional";
    const contextPhrases = userContext.commonPhrases?.length
      ? userContext.commonPhrases.slice(0, 3).join(", ")
      : "";

    // Limit email examples to 5 most relevant ones
    const emailExamples = userContext.emailExamples?.slice(0, 5) || [];

    if (emailExamples.length > 0) {
      this.logger.debug(
        `[generateReplyDraft] Using ${emailExamples.length} email examples for reply generation`,
      );
    } else {
      this.logger.debug(
        `[generateReplyDraft] No email examples provided (userContext.emailExamples: ${userContext.emailExamples?.length || 0})`,
      );
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      tone,
      writingStyle: userContext.writingStyle || "",
      fromName: originalEmail.fromName || originalEmail.from,
      subject: originalEmail.subject,
      body: cleanedBody,
      commonPhrases: contextPhrases || "",
      emailExamples,
    });

    return await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.SEVENTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        userId,
      },
      provider,
      userId,
      LLM_OP_GENERATE_REPLY,
    );
  }

  async generateMeetingReply(
    originalEmail: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    },
    availableSlots: Array<{ start: string; end: string }>,
    calendarBookingUrl?: string,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string> {
    // Clean email body: strip HTML, remove signatures, limit to 1000 chars
    const cleanedBody = cleanEmailContent(originalEmail.body, null, 1000);

    const promptConfig = getPrompt("generate_meeting_reply");
    if (!promptConfig) {
      this.logger.error(
        "generate_meeting_reply prompt not found in markdown files - cannot generate meeting reply",
      );
      throw new Error("Meeting reply generation prompt not available");
    }

    const hasAvailableSlots = availableSlots.length > 0;
    let slotsText = "";
    if (hasAvailableSlots) {
      slotsText = availableSlots
        .slice(0, 5)
        .map((slot, i) => {
          const start = new Date(slot.start);
          return `${i + 1}. ${start.toLocaleDateString()} at ${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        })
        .join("\n");
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      hasAvailableSlots,
      fromName: originalEmail.fromName || originalEmail.from,
      subject: originalEmail.subject,
      body: cleanedBody,
      slotsText,
      calendarLink: calendarBookingUrl || "",
    });

    return await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.SEVENTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_TINY,
        userId,
      },
      provider,
      userId,
      LLM_OP_GENERATE_MEETING_REPLY,
    );
  }

  /**
   * Generate a follow-up draft for an email that hasn't received a reply
   * @param subject Email thread subject
   * @param threadMessages Last few messages in the thread (3-5 messages, in chronological order)
   * @param theirName Name of the recipient
   * @param businessDaysWaiting Number of business days since last user message
   * @param userCommunicationStyle User's communication style from context (tone, common phrases)
   * @param provider Optional LLM provider override
   * @param userId Optional user ID for API key
   */
  // eslint-disable-next-line max-params
  async generateFollowUpDraft(
    subject: string,
    threadMessages: Array<{
      from: string;
      fromName?: string;
      body: string;
      receivedAt: Date;
      isFromUser: boolean;
    }>,
    theirName: string,
    businessDaysWaiting: number,
    userCommunicationStyle?: { tone?: string; commonPhrases?: string[] },
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string> {
    const promptConfig = getPrompt("generate_follow_up");
    if (!promptConfig) {
      this.logger.error(
        "generate_follow_up prompt not found in markdown files - cannot generate follow-up",
      );
      throw new Error("Follow-up generation prompt not available");
    }

    // Build thread context from last few messages
    const threadContext = threadMessages
      .map((msg, idx) => {
        const sender = msg.isFromUser ? "You" : msg.fromName || msg.from;
        const date = new Date(msg.receivedAt).toLocaleDateString();
        const cleanedBody = cleanEmailContent(msg.body, "").substring(0, 500);
        return `[Message ${idx + 1} from ${sender} on ${date}]:\n${cleanedBody}`;
      })
      .join("\n\n---\n\n");

    // Check if user has a preference to skip greeting (from tone settings or context)
    const skipGreeting =
      userCommunicationStyle?.tone?.toLowerCase().includes("no greeting") ||
      userCommunicationStyle?.tone?.toLowerCase().includes("skip greeting");

    const prompt = renderPrompt(promptConfig.prompt || "", {
      tone: userCommunicationStyle?.tone || "",
      commonPhrases: userCommunicationStyle?.commonPhrases?.join(", ") || "",
      subject,
      threadMessageCount: threadMessages.length,
      threadContext,
      recipientName: theirName,
      businessDaysWaiting,
      daysLabel: businessDaysWaiting === 1 ? "day" : "days",
      skipGreeting,
    });

    return await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.SEVENTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_EXPLANATION,
        userId,
      },
      provider,
      userId,
      LLM_OP_GENERATE_FOLLOW_UP,
    );
  }

  /**
   * Analyze override reason to extract rules and suggest context updates
   */
  async analyzeOverrideReason(
    email: {
      from: string;
      fromName?: string | null;
      subject: string;
      body: string;
    },
    reasonType: string,
    reasonText: string,
    currentContext: Array<{
      contextKey: string;
      contextValue: string;
      priority?: number | null;
    }>,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<{
    suggestedRules: string[];
    updatedContexts: Array<{
      contextKey: string;
      contextValue: string;
      priority?: number;
    }>;
  }> {
    const cleanedBody = cleanEmailContent(email.body || "", null, 1000);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _contextSummary = currentContext
      .slice(0, 10)
      .map((c) => `${c.contextKey}: ${c.contextValue}`)
      .join("\n");

    const promptConfig = getPrompt("analyze_priority_feedback");
    if (!promptConfig) {
      this.logger.error(
        "analyze_priority_feedback prompt not found in markdown files - cannot analyze feedback",
      );
      return { suggestedRules: [], updatedContexts: [] };
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      fromName: email.fromName || email.from,
      subject: email.subject,
      body: cleanedBody.substring(0, 500),
      reasonType,
      reason: reasonText,
    });

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: 800,
        userId,
      },
      provider,
      userId,
      LLM_OP_ANALYZE_OVERRIDE_REASON,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          suggestedRules: parsed.suggestedRules || [],
          updatedContexts: parsed.updatedContexts || [],
        };
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM override reason analysis response as JSON",
        error,
      );
    }

    return {
      suggestedRules: [],
      updatedContexts: [],
    };
  }

  getAvailableProviders(): LLMProvider[] {
    return this.llmCoreService.getAvailableProviders();
  }

  getDefaultProvider(): LLMProvider {
    return this.llmCoreService.getDefaultProvider();
  }

  /**
   * Analyze time patterns from hour arrays
   */
  private getTimePattern(hours: number[]): string {
    if (hours.length === 0) return "";

    // Count hours
    const hourCounts = new Map<number, number>();
    hours.forEach((h) => hourCounts.set(h, (hourCounts.get(h) || 0) + 1));

    // Find peak hours (hours with most activity)
    const sortedHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    if (sortedHours.length === 0) return "";

    const peakHours = sortedHours
      .map(([hour, count]) => {
        const period = hour < TIME_FORMATTING.NOON_HOUR ? "AM" : "PM";
        const hour12 =
          hour % TIME_FORMATTING.HOURS_IN_HALF_DAY ||
          TIME_FORMATTING.HOURS_IN_HALF_DAY;
        return `${hour12}${period} (${count} emails)`;
      })
      .join(", ");

    return `Peak activity: ${peakHours}`;
  }

  async extractQAndA(
    userReplies: Array<{
      subject: string;
      body: string;
      receivedAt: string;
    }>,
    userId?: string,
    provider?: LLMProvider,
  ): Promise<Array<{ question: string; answer: string; frequency: number }>> {
    const promptConfig = getPrompt("extract_common_questions");
    if (!promptConfig) {
      this.logger.error(
        "extract_common_questions prompt not found in markdown files - cannot extract questions",
      );
      return [];
    }

    // Remove quoted/replied content from user's emails to focus on their actual responses
    const cleanReplies = userReplies.map((e) => {
      const body = cleanEmailContent(e.body, null, 1000);
      return `Subject: ${e.subject}\nBody: ${body}`;
    });

    const repliesText = cleanReplies.join("\n\n---\n\n");

    const prompt = renderPrompt(promptConfig.prompt || "", {
      repliesText,
    });

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        userId,
      },
      provider,
      userId,
      LLM_OP_EXTRACT_QANDA,
    );

    try {
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return Array.isArray(parsed)
          ? // Require minimum occurrences
            parsed.filter((qa) => qa.frequency >= QA_EXTRACTION.MIN_FREQUENCY)
          : [];
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM Q&A extraction response as JSON",
        error,
      );
    }

    return [];
  }

  async generateSearchRelevanceExplanation(
    query: string,
    email: {
      from: string;
      subject: string;
      body: string;
      receivedAt: string;
    },
    userId?: string,
    provider?: LLMProvider,
  ): Promise<string> {
    // Load prompt from markdown file
    const promptConfig = getPrompt("search_relevance_explanation");
    if (!promptConfig) {
      this.logger.error("search_relevance_explanation prompt not found");
      return "";
    }

    // Calculate days ago
    const receivedDate = new Date(email.receivedAt);
    const now = new Date();
    const daysAgo = Math.floor(
      (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    const isRecent = daysAgo <= RECENCY_THRESHOLDS.RECENT_DAYS;
    let receivedAtText: string;
    if (daysAgo === 0) {
      receivedAtText = "today";
    } else if (daysAgo === 1) {
      receivedAtText = "yesterday";
    } else {
      receivedAtText = `${daysAgo} days ago`;
    }

    // Render prompt with variables
    const fullPrompt = renderPrompt(promptConfig.prompt || "", {
      query,
      from: email.from,
      subject: email.subject,
      bodyPreview: cleanEmailContent(email.body, null, 500),
      receivedAt: receivedAtText,
      isRecent: isRecent ? " (recent)" : "",
    });

    const response = await this.generateText(
      {
        prompt: fullPrompt,
        systemPrompt:
          "You are a helpful email search assistant. Provide concise, specific explanations.",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_VERY_SMALL,
        userId,
      },
      provider,
      userId,
      LLM_OP_SEARCH_RELEVANCE,
    );

    return response.trim();
  }

  /**
   * Generate explanations for multiple emails in a single batch call (faster than individual calls)
   */
  // eslint-disable-next-line max-lines-per-function, complexity, max-statements
  async generateSearchRelevanceExplanationsBatch(
    query: string,
    emails: Array<{
      index: number;
      from: string;
      subject: string;
      body: string;
      receivedAt: string;
    }>,
    userId?: string,
    provider?: LLMProvider,
  ): Promise<Map<number, string>> {
    if (emails.length === 0) {
      return new Map();
    }

    // Load prompt from markdown file
    const promptConfig = getPrompt("search_relevance_explanation");
    if (!promptConfig) {
      this.logger.error("search_relevance_explanation prompt not found");
      return new Map();
    }

    const now = new Date();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const emailDetails = emails.map((email, idx) => {
      const receivedDate = new Date(email.receivedAt);
      const daysAgo = Math.floor(
        (now.getTime() - receivedDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      let receivedAtText: string;
      if (daysAgo === 0) {
        receivedAtText = "today";
      } else if (daysAgo === 1) {
        receivedAtText = "yesterday";
      } else {
        receivedAtText = `${daysAgo} days ago`;
      }
      const isRecent = daysAgo <= RECENCY_THRESHOLDS.RECENT_DAYS;

      return {
        index: email.index,
        from: email.from,
        subject: email.subject,
        bodyPreview: cleanEmailContent(
          email.body,
          null,
          BODY_PREVIEW_LENGTHS.BATCH_PREVIEW,
        ),
        receivedAt: receivedAtText,
        isRecent: isRecent ? " (recent)" : "",
      };
    });

    // Render prompt from file with batch data
    // Ensure emails array is passed correctly
    if (!Array.isArray(emailDetails) || emailDetails.length === 0) {
      this.logger.warn(
        "generateSearchRelevanceExplanationsBatch called with empty or invalid emails array",
      );
      return new Map();
    }

    const fullPrompt = renderPrompt(promptConfig.prompt || "", {
      query,
      emails: emailDetails,
      // This should trigger {{#if emails}} to be true
    });

    // Log the rendered prompt to debug
    this.logger.debug(
      `Batch explanation: ${emails.length} emails, prompt length: ${fullPrompt.length}`,
    );
    this.logger.debug(
      `Rendered prompt preview (first ${BODY_PREVIEW_LENGTHS.DEBUG_LOG_PREVIEW} chars):\n${fullPrompt.substring(0, BODY_PREVIEW_LENGTHS.DEBUG_LOG_PREVIEW)}`,
    );

    // Verify the prompt contains the emails section
    if (!fullPrompt.includes("Email") || !fullPrompt.includes("index:")) {
      this.logger.error(
        "Rendered prompt does not contain email details! Prompt may not have rendered correctly.",
      );
      this.logger.error(`Full prompt:\n${fullPrompt}`);
    }

    try {
      const response = await this.generateText(
        {
          prompt: fullPrompt,
          systemPrompt:
            "You are a helpful email search assistant. Return only valid JSON objects.",
          temperature: RATIOS.THIRTY_PERCENT,
          maxTokens: Math.min(
            QUERY_LIMITS.LLM_BATCH_EXPLANATION_BASE,
            emails.length * QUERY_LIMITS.LLM_BATCH_EXPLANATION_PER_EMAIL,
          ),
          // Increased tokens for better responses
          userId,
        },
        provider,
        userId,
        LLM_OP_SEARCH_RELEVANCE_BATCH,
      );

      this.logger.debug(
        `Batch explanation response received. Length: ${response.length}, First ${QUERY_LIMITS.LLM_REASONING_MAX_LENGTH} chars: ${response.substring(0, QUERY_LIMITS.LLM_REASONING_MAX_LENGTH)}`,
      );

      // Parse JSON response - try multiple patterns
      let jsonStr: string | null = null;

      // Try 1: Direct JSON object
      const directMatch = response.match(/\{[\s\S]*\}/);
      if (directMatch) {
        jsonStr = directMatch[0];
      }

      // Try 2: JSON in markdown code block
      if (!jsonStr) {
        const codeBlockMatch = response.match(
          /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
        );
        if (codeBlockMatch && codeBlockMatch[1]) {
          jsonStr = codeBlockMatch[1];
        }
      }

      // Try 3: JSON after "Return" or similar text
      if (!jsonStr) {
        const afterTextMatch = response.match(
          /(?:return|json|result)[\s:]*(\{[\s\S]*\})/i,
        );
        if (afterTextMatch && afterTextMatch[1]) {
          jsonStr = afterTextMatch[1];
        }
      }

      if (jsonStr) {
        try {
          const explanations = JSON.parse(jsonStr);

          if (typeof explanations !== "object" || Array.isArray(explanations)) {
            throw new Error("Response is not a JSON object");
          }

          const result = new Map<number, string>();

          this.logger.debug(
            `Parsed JSON explanations. Type: ${typeof explanations}, Keys: ${Object.keys(explanations).join(", ")}`,
          );

          // Map explanations by index - try multiple key formats
          emailDetails.forEach((email) => {
            // Try: number key, string key, stringified number key
            const explanation =
              explanations[email.index] ||
              explanations[String(email.index)] ||
              explanations[email.index.toString()] ||
              explanations[`${email.index}`];

            if (
              explanation &&
              typeof explanation === "string" &&
              explanation.trim().length > 0
            ) {
              result.set(email.index, explanation.trim());
            } else {
              // Fallback explanation if batch generation missed it
              this.logger.warn(
                `Missing explanation for email index ${email.index}. Available keys: ${Object.keys(explanations).join(", ")}`,
              );
              result.set(
                email.index,
                `Relevant to "${query}" based on sender, subject, or content.`,
              );
            }
          });

          this.logger.debug(
            `Batch explanation complete. Generated ${result.size} explanations out of ${emails.length} emails.`,
          );

          if (result.size === 0) {
            this.logger.error(
              `No explanations generated! JSON keys: ${Object.keys(explanations).join(", ")}, Expected indices: ${emailDetails.map((e) => e.index).join(", ")}`,
            );
          }

          return result;
        } catch (parseError) {
          this.logger.error(
            `Failed to parse JSON from batch explanation response:`,
            parseError,
          );
          this.logger.error(
            `JSON string that failed to parse: ${jsonStr.substring(0, 500)}`,
          );
        }
      } else {
        this.logger.error(
          `Failed to find JSON in batch explanation response. Full response (first 1000 chars):\n${response.substring(0, 1000)}`,
        );
      }
    } catch (error) {
      this.logger.error("Batch explanation generation failed", error);
      this.logger.error(
        `Error details: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Fallback: return empty map (will trigger individual calls)
    return new Map();
  }

  /**
   * Redact person names from text using LLM for better accuracy.
   * Replaces names with [Name] placeholder.
   * Falls back to regex-based redaction if LLM fails.
   */
  async redactNamesWithLLM(text: string): Promise<string> {
    if (!text || text.trim().length === 0) {
      return text;
    }

    const promptConfig = getPrompt("redact_names");
    if (!promptConfig) {
      this.logger.warn(
        "redact_names prompt not found - falling back to original text",
      );
      return text;
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      text,
    });

    try {
      const redacted = await this.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: 0.1, // Low temperature for consistent output
          maxTokens: text.length + 100, // Allow some overhead for replacements
        },
        undefined,
        undefined,
        LLM_OP_REDACT_NAMES,
      );

      // Basic validation - ensure we got something back
      if (redacted && redacted.trim().length > 0) {
        return redacted.trim();
      }

      return text;
    } catch (error) {
      this.logger.error("Failed to redact names with LLM:", error);
      return text;
    }
  }

  async validateWritingExample(text: string): Promise<string | null> {
    if (!text || text.trim().length === 0) {
      return null;
    }

    const promptConfig = getPrompt("validate_writing_example");
    if (!promptConfig) {
      this.logger.warn(
        "validate_writing_example prompt not found - falling back to redactNamesWithLLM",
      );
      return this.redactNamesWithLLM(text);
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      text,
    });

    try {
      const result = await this.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: 0.1,
          maxTokens: text.length + 200,
        },
        undefined,
        undefined,
        LLM_OP_VALIDATE_WRITING_EXAMPLE,
      );

      const trimmed = result?.trim();
      if (!trimmed) {
        return null;
      }

      const cleaned = trimmed
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      try {
        const parsed = JSON.parse(cleaned);
        if (parsed.status === "rejected") {
          this.logger.debug(
            `Writing example rejected: ${parsed.reason || "no reason given"}`,
          );
          return null;
        }
        if (parsed.status === "valid" && parsed.cleanedText) {
          return parsed.cleanedText;
        }
        this.logger.warn(
          `Unexpected JSON structure from validateWritingExample: ${cleaned.substring(0, 100)}`,
        );
        return null;
      } catch (parseError) {
        this.logger.warn(
          `Failed to parse validateWritingExample JSON response: ${cleaned.substring(0, 100)}`,
        );
        return null;
      }
    } catch (error) {
      this.logger.error("Failed to validate writing example with LLM:", error);
      return null;
    }
  }

  async disputeToneCheck(
    emailText: string,
    rules: string[],
    suggestions: string[],
    userArgument: string,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<{
    accepted: boolean;
    rulesToRemove: string[];
    explanation: string;
  }> {
    const promptConfig = getPrompt("dispute_tone_check");
    if (!promptConfig) {
      this.logger.error(
        "dispute_tone_check prompt not found in markdown files",
      );
      return {
        accepted: false,
        rulesToRemove: [],
        explanation: "Unable to process dispute - prompt not available",
      };
    }

    const prompt = renderPrompt(promptConfig.prompt || "", {
      emailText,
      rules,
      suggestions,
      userArgument,
    });

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: 800,
        userId,
      },
      provider,
      userId,
      LLM_OP_DISPUTE_TONE_CHECK,
    );

    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          accepted: !!parsed.accepted,
          rulesToRemove: Array.isArray(parsed.rulesToRemove)
            ? parsed.rulesToRemove
            : [],
          explanation: parsed.explanation || "",
        };
      }
    } catch (error) {
      this.logger.warn(
        "Failed to parse LLM dispute tone check response as JSON",
        error,
      );
    }

    return {
      accepted: false,
      rulesToRemove: [],
      explanation: "Unable to process your argument",
    };
  }

  /**
   * Check if a string starts with an emoji
   */
  private startsWithEmoji(text: string): boolean {
    // Emoji regex pattern that matches most common emojis at the start of a string
    const emojiPattern =
      /^(?:[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}])/u;
    return emojiPattern.test(text);
  }

  /**
   * Mapping of category keywords to appropriate emojis
   */
  private readonly categoryEmojiMap: Record<string, string> = {
    // Work & Business
    recruitment: "👔",
    hiring: "👔",
    job: "👔",
    career: "👔",
    hr: "👔",
    "human resources": "👔",
    support: "🎧",
    "customer service": "🎧",
    helpdesk: "🎧",
    sales: "💰",
    marketing: "📣",
    promotion: "📣",
    advertising: "📣",
    finance: "💵",
    accounting: "💵",
    invoice: "💵",
    billing: "💵",
    payment: "💵",
    legal: "⚖️",
    contract: "⚖️",
    compliance: "⚖️",
    // Development & Tech
    development: "💻",
    engineering: "💻",
    code: "💻",
    github: "🐙",
    gitlab: "🦊",
    "pull request": "🔀",
    "merge request": "🔀",
    "code review": "🔍",
    bug: "🐛",
    issue: "🐛",
    ci: "🔧",
    "ci/cd": "🔧",
    build: "🔧",
    deploy: "🚀",
    deployment: "🚀",
    release: "🚀",
    security: "🔒",
    // Communication & Meetings
    meeting: "📅",
    calendar: "📅",
    schedule: "📅",
    appointment: "📅",
    team: "👥",
    collaboration: "👥",
    newsletter: "📰",
    news: "📰",
    update: "📰",
    announcement: "📢",
    notification: "🔔",
    alert: "🔔",
    // Personal & Social
    personal: "👤",
    social: "🌐",
    networking: "🤝",
    event: "🎉",
    invitation: "💌",
    // Education & Learning
    education: "🎓",
    learning: "📚",
    training: "📚",
    course: "📚",
    webinar: "🎥",
    // Travel & Logistics
    travel: "✈️",
    shipping: "📦",
    delivery: "📦",
    order: "📦",
    // Other common categories
    spam: "🚫",
    junk: "🚫",
    archive: "📁",
    important: "⭐",
    urgent: "🚨",
    priority: "🚨",
    project: "📋",
    task: "✅",
    todo: "✅",
    feedback: "💬",
    survey: "📊",
    report: "📊",
    analytics: "📊",
    subscription: "📧",
    vendor: "🏢",
    partner: "🤝",
    client: "🤝",
    customer: "🤝",
  };

  /**
   * Ensure a category name has an emoji at the start.
   * If the name already starts with an emoji, return it unchanged.
   * Otherwise, try to find a matching emoji based on keywords, or use a default.
   */
  private ensureCategoryEmoji(name: string): string {
    const trimmedName = name.trim();

    // If already has an emoji at the start, return unchanged
    if (this.startsWithEmoji(trimmedName)) {
      return trimmedName;
    }

    // Try to find a matching emoji based on keywords in the name
    const lowerName = trimmedName.toLowerCase();
    for (const [keyword, emoji] of Object.entries(this.categoryEmojiMap)) {
      if (lowerName.includes(keyword)) {
        return `${emoji} ${trimmedName}`;
      }
    }

    // Default emoji if no match found
    return `📁 ${trimmedName}`;
  }

  async consolidateEmailCategories(
    autoGeneratedCategories: Array<{ name: string; description: string }>,
    userAddedCategories: Array<{ name: string; description: string }>,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<
    Array<{ name: string; description: string; isUserAdded: boolean }>
  > {
    this.logger.log(
      `[CATEGORY-CONSOLIDATION] === START === Input: ${autoGeneratedCategories.length} auto-generated, ${userAddedCategories.length} user-added categories`,
    );

    // Log the input categories for debugging
    if (autoGeneratedCategories.length > 0) {
      this.logger.log(
        `[CATEGORY-CONSOLIDATION] Auto-generated categories:\n${autoGeneratedCategories.map((c) => `  - ${c.name}`).join("\n")}`,
      );
    }

    if (
      autoGeneratedCategories.length <= 1 &&
      userAddedCategories.length === 0
    ) {
      this.logger.log(
        `[CATEGORY-CONSOLIDATION] Skipping consolidation - only ${autoGeneratedCategories.length} auto-generated categories`,
      );
      return autoGeneratedCategories.map((c) => ({ ...c, isUserAdded: false }));
    }

    const promptConfig = getPrompt("consolidate_categories");
    if (!promptConfig) {
      this.logger.error(
        "[CATEGORY-CONSOLIDATION] ERROR: consolidate_categories prompt not found in markdown files",
      );
      return [
        ...autoGeneratedCategories.map((c) => ({ ...c, isUserAdded: false })),
        ...userAddedCategories.map((c) => ({ ...c, isUserAdded: true })),
      ];
    }

    const categoriesText =
      autoGeneratedCategories.length > 0
        ? autoGeneratedCategories
            .map((c) => `- ${c.name}: ${c.description}`)
            .join("\n")
        : "None";

    const userCategoriesText =
      userAddedCategories.length > 0
        ? userAddedCategories
            .map((c) => `- ${c.name}: ${c.description} (USER-ADDED - PRESERVE)`)
            .join("\n")
        : "None";

    const prompt = renderPrompt(promptConfig.prompt || "", {
      categories: categoriesText,
      userCategories: userCategoriesText,
    });

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Calling LLM to consolidate ${autoGeneratedCategories.length} auto-generated + ${userAddedCategories.length} user-added categories`,
    );

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        userId,
      },
      provider,
      userId,
      LLM_OP_CONSOLIDATE_CATEGORIES,
    );

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] LLM response received (length: ${response.length} chars)`,
    );
    this.logger.log(
      `[CATEGORY-CONSOLIDATION] Raw LLM response (first 500 chars): ${response.substring(0, 500)}`,
    );

    try {
      const jsonString = response
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        this.logger.log(
          `[CATEGORY-CONSOLIDATION] Found JSON array in response`,
        );
        const parsed = JSON.parse(jsonMatch[0]);
        this.logger.log(
          `[CATEGORY-CONSOLIDATION] Parsed ${parsed.length} items from LLM response`,
        );

        if (Array.isArray(parsed) && parsed.length > 0) {
          const consolidated = parsed
            .filter(
              (item: { name?: string; description?: string }) =>
                item.name && item.description,
            )
            .map(
              (item: {
                name: string;
                description: string;
                isUserAdded?: boolean;
              }) => ({
                name: String(item.name).trim(),
                description: String(item.description).trim(),
                isUserAdded: !!item.isUserAdded,
              }),
            );

          // Ensure each category has an emoji at the start (if not user-added and doesn't already have one)
          const withEmojis = consolidated.map((c) => ({
            ...c,
            name: c.isUserAdded ? c.name : this.ensureCategoryEmoji(c.name),
          }));

          this.logger.log(
            `[CATEGORY-CONSOLIDATION] === SUCCESS === Consolidated ${autoGeneratedCategories.length} -> ${withEmojis.filter((c) => !c.isUserAdded).length} auto-generated (+ ${withEmojis.filter((c) => c.isUserAdded).length} user-added preserved)`,
          );
          this.logger.log(
            `[CATEGORY-CONSOLIDATION] Consolidated categories:\n${withEmojis.map((c) => `  - ${c.name} (isUserAdded: ${c.isUserAdded})`).join("\n")}`,
          );
          return withEmojis;
        } else {
          this.logger.warn(
            `[CATEGORY-CONSOLIDATION] Parsed array is empty or not an array`,
          );
        }
      } else {
        this.logger.warn(
          `[CATEGORY-CONSOLIDATION] No JSON array found in response`,
        );
      }
    } catch (error) {
      this.logger.error(
        `[CATEGORY-CONSOLIDATION] ERROR: Failed to parse LLM response as JSON: ${error}`,
      );
    }

    this.logger.log(
      `[CATEGORY-CONSOLIDATION] === FALLBACK === Returning original categories without consolidation`,
    );
    return [
      ...autoGeneratedCategories.map((c) => ({ ...c, isUserAdded: false })),
      ...userAddedCategories.map((c) => ({ ...c, isUserAdded: true })),
    ];
  }

  /**
   * Generate new categories from emails currently in "Other" category.
   * This analyzes the emails and suggests more specific categories that would better organize them.
   */
  async generateCategoriesFromOther(
    otherEmails: Array<{
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    }>,
    existingCategories: Array<{ name: string; description: string }>,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<Array<{ name: string; description: string }>> {
    this.logger.log(
      `[GENERATE-CATEGORIES] === START === Analyzing ${otherEmails.length} emails in "Other" category`,
    );

    if (otherEmails.length === 0) {
      this.logger.log(
        `[GENERATE-CATEGORIES] No emails in "Other" category to analyze`,
      );
      return [];
    }

    const promptConfig = getPrompt("generate_categories_from_other");
    if (!promptConfig) {
      this.logger.error(
        "[GENERATE-CATEGORIES] ERROR: generate_categories_from_other prompt not found in markdown files",
      );
      return [];
    }

    // Format existing categories for the prompt
    const existingCategoriesText =
      existingCategories.length > 0
        ? existingCategories
            .map((c) => `- ${c.name}: ${c.description}`)
            .join("\n")
        : "None";

    // Format emails for the prompt (limit to first 30 for token efficiency)
    const emailsToAnalyze = otherEmails.slice(
      0,
      CONTEXT_ANALYSIS.MAX_EMAILS_FOR_CATEGORY_ANALYSIS,
    );
    const otherEmailsText = emailsToAnalyze
      .map(
        (e, i) =>
          `[Email ${i + 1}]\nFrom: ${e.fromName || e.from}\nSubject: ${e.subject}\nBody preview: ${cleanEmailContent(e.body || "", null, 200)}`,
      )
      .join("\n\n");

    const prompt = renderPrompt(promptConfig.prompt || "", {
      existingCategories: existingCategoriesText,
      otherEmails: otherEmailsText,
    });

    this.logger.log(
      `[GENERATE-CATEGORIES] Calling LLM to analyze ${emailsToAnalyze.length} emails and suggest new categories`,
    );

    const response = await this.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        userId,
      },
      provider,
      userId,
      LLM_OP_GENERATE_CATEGORIES_FROM_OTHER,
    );

    this.logger.log(
      `[GENERATE-CATEGORIES] LLM response received (length: ${response.length} chars)`,
    );

    try {
      const jsonString = response
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (Array.isArray(parsed)) {
          // Filter out any categories that already exist (case-insensitive comparison)
          const existingNames = new Set(
            existingCategories.map((c) =>
              c.name.toLowerCase().replace(/^[^\w]+/, ""),
            ),
          );

          const newCategories = parsed
            .filter(
              (item: { name?: string; description?: string }) =>
                item.name && item.description,
            )
            .map((item: { name: string; description: string }) => ({
              name: this.ensureCategoryEmoji(String(item.name).trim()),
              description: String(item.description).trim(),
            }))
            .filter((cat) => {
              const normalizedName = cat.name
                .toLowerCase()
                .replace(/^[^\w]+/, "");
              return !existingNames.has(normalizedName);
            });

          this.logger.log(
            `[GENERATE-CATEGORIES] === SUCCESS === Generated ${newCategories.length} new categories`,
          );
          this.logger.log(
            `[GENERATE-CATEGORIES] New categories:\n${newCategories.map((c) => `  - ${c.name}`).join("\n")}`,
          );
          return newCategories;
        }
      }
    } catch (error) {
      this.logger.error(
        `[GENERATE-CATEGORIES] ERROR: Failed to parse LLM response as JSON: ${error}`,
      );
    }

    this.logger.log(
      `[GENERATE-CATEGORIES] === FALLBACK === No new categories generated`,
    );
    return [];
  }

  /**
   * Identify custom labels from email scan that could be converted into categories.
   * Filters out system labels and suggests useful category candidates.
   */
  async identifyCustomLabels(
    labels: string[],
    provider?: LLMProvider,
    userId?: string,
  ): Promise<
    Array<{
      label: string;
      categoryName: string;
      description: string;
      confidence: "HIGH" | "MEDIUM" | "LOW";
    }>
  > {
    this.logger.log(
      `[IDENTIFY-CUSTOM-LABELS] === START === Input: ${labels.length} labels`,
    );

    if (labels.length === 0) {
      this.logger.log(
        `[IDENTIFY-CUSTOM-LABELS] === SKIP === No labels to analyze`,
      );
      return [];
    }

    const prompt = await renderPrompt("identify_custom_labels", {
      labels: labels.join(", "),
    });

    this.logger.log(`[IDENTIFY-CUSTOM-LABELS] Calling LLM to identify labels`);
    const response = await this.generateText(
      {
        prompt,
        systemPrompt: "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        userId,
      },
      provider,
      userId,
      LLM_OP_IDENTIFY_CUSTOM_LABELS,
    );

    this.logger.log(
      `[IDENTIFY-CUSTOM-LABELS] LLM response received (length: ${response.length} chars)`,
    );

    try {
      const jsonString = response
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        if (Array.isArray(parsed)) {
          const customLabels = parsed
            .filter(
              (item: {
                label?: string;
                categoryName?: string;
                description?: string;
                confidence?: string;
              }) =>
                item.label &&
                item.categoryName &&
                item.description &&
                item.confidence,
            )
            .map(
              (item: {
                label: string;
                categoryName: string;
                description: string;
                confidence: string;
              }) => ({
                label: String(item.label).trim(),
                categoryName: String(item.categoryName).trim(),
                description: String(item.description).trim(),
                confidence: String(item.confidence).trim() as
                  | "HIGH"
                  | "MEDIUM"
                  | "LOW",
              }),
            );

          this.logger.log(
            `[IDENTIFY-CUSTOM-LABELS] === SUCCESS === Identified ${customLabels.length} custom labels`,
          );
          this.logger.log(
            `[IDENTIFY-CUSTOM-LABELS] Labels:\n${customLabels.map((l) => `  - ${l.categoryName} (${l.confidence})`).join("\n")}`,
          );
          return customLabels;
        }
      }
    } catch (error) {
      this.logger.error(
        `[IDENTIFY-CUSTOM-LABELS] === ERROR === Failed to parse LLM response: ${getErrorMessage(error)}`,
      );
      this.logger.log(
        `[IDENTIFY-CUSTOM-LABELS] Raw response:\n${response.substring(0, 500)}`,
      );
    }

    this.logger.log(
      `[IDENTIFY-CUSTOM-LABELS] === FALLBACK === No custom labels identified`,
    );
    return [];
  }
}
