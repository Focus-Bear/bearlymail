import { forwardRef, Inject, Injectable, Logger } from "@nestjs/common";

import { AUTO_REPLY_VALUES } from "../constants/domain-types";
import {
  BODY_PREVIEW_LENGTHS,
  EMAIL_CLASSIFICATION,
} from "../constants/llm-constants";
import { RATIOS } from "../constants/percentages";
import { ErrorTrackingService } from "../error-tracking/error-tracking.service";
import { StructuralError } from "../errors/structural-error";
import { cleanEmailContent } from "../llm/email-content-cleaner";
import { LLMProvider, LLMService } from "../llm/llm.service";
import {
  LLM_OP_CHECK_CUSTOM_EXCLUSION_RULES,
  LLM_OP_CLASSIFY_EMAIL,
} from "../llm/llm-operations";
import {
  CLASSIFICATION_PROMPT_IDS,
  getPrompt,
  renderPrompt,
} from "../llm/prompts";
import { LLM_CONFIG } from "./auto-responder-constants";
import { EmailClassification } from "./types/auto-responder.types";

/**
 * Service for classifying emails to determine if auto-response should be sent
 * Uses a combination of header analysis and LLM-based content classification
 */
@Injectable()
export class EmailClassifierService {
  private readonly logger = new Logger(EmailClassifierService.name);

  // Common automated email patterns
  private readonly automatedPatterns = {
    senders: [
      /^noreply@/i,
      /^no-reply@/i,
      /^donotreply@/i,
      /^do-not-reply@/i,
      /^mailer-daemon@/i,
      /^postmaster@/i,
      /^notifications?@/i,
      /^alerts?@/i,
      /^auto@/i,
      /^automated@/i,
      /^system@/i,
      /^support@.*\.(zendesk|freshdesk|intercom|helpscout)/i,
      /^.*@.*\.notifications\./i,
    ],
    subjects: [
      /\[auto(-)?reply\]/i,
      /automatic reply/i,
      /out of (the )?office/i,
      /auto(-)?response/i,
      /delivery (status )?notification/i,
      /undeliverable/i,
      /read receipt/i,
      /return receipt/i,
    ],
  };

  // Newsletter patterns
  private readonly newsletterPatterns = {
    senders: [
      /@.*mail\.(mailchimp|constantcontact|sendgrid|mailgun|convertkit)/i,
      /@.*\.substack\.com$/i,
      /newsletter@/i,
      /digest@/i,
      /updates@/i,
      /marketing@/i,
      /promo(tions)?@/i,
    ],
    subjects: [
      /\bunsubscribe\b/i,
      /\bweekly digest\b/i,
      /\bdaily digest\b/i,
      /\bnewsletter\b/i,
      /\bmonthly update\b/i,
    ],
  };

  // Cold outreach patterns
  private readonly coldOutreachPatterns = {
    greetings: [
      /^dear (sir|madam|sir\/madam|hiring manager|recruiter)/i,
      /^to whom it may concern/i,
      /^hello there[,!]?\s*$/i,
      /^greetings[,!]?\s*$/i,
    ],
    mergeFields: [
      // Handlebars-style
      /\{\{.*?\}\}/g,
      // Double bracket style
      /\[\[.*?\]\]/g,
      // Percent-style
      /%[A-Z_]+%/g,
      // Template literal style
      /\$\{.*?\}/g,
      /\{FIRST_?NAME\}/i,
      /\{COMPANY\}/i,
      /\{NAME\}/i,
    ],
    phrases: [
      /\bquick question\b/i,
      /\bwanted to reach out\b/i,
      /\bhope this finds you well\b/i,
      /\bjust following up\b/i,
      /\bsaw your (profile|linkedin|company)/i,
      /\bI came across your/i,
      /\bwould love to connect\b/i,
      /\bschedule a (quick )?call\b/i,
      /\b15 (minute|min) (call|chat)\b/i,
    ],
  };

  constructor(
    @Inject(forwardRef(() => LLMService))
    private llmService: LLMService,
    private errorTrackingService: ErrorTrackingService,
  ) {}

  /**
   * Classify an email to determine if auto-response should be sent
   * @param email Email content and metadata
   * @param headers Optional email headers for header-based detection
   * @param threadHasReplies Whether this thread already has replies from the user
   */
  async classifyEmail(
    email: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
      htmlBody?: string;
    },
    headers?: Record<string, string>,
    threadHasReplies?: boolean,
  ): Promise<EmailClassification> {
    const headerClassification = this.classifyByHeaders(headers || {});
    const senderClassification = this.classifyBySender(email.from);
    const subjectClassification = this.classifyBySubject(email.subject);

    const reasons = this.buildPatternReasons(
      headerClassification,
      senderClassification,
      subjectClassification,
      email.from,
      email.subject,
    );

    const isAutomated =
      headerClassification.isAutomated ||
      senderClassification.isAutomated ||
      subjectClassification.isAutomated;
    const isNewsletter =
      headerClassification.isNewsletter || senderClassification.isNewsletter;
    const { isBounce } = headerClassification;
    const isOutOfOffice =
      headerClassification.isOutOfOffice || subjectClassification.isOutOfOffice;

    if (isAutomated || isNewsletter || isBounce || isOutOfOffice) {
      return {
        isAutomated,
        isNewsletter,
        isColdOutreach: false,
        isReply: threadHasReplies || false,
        isOutOfOffice,
        isBounce,
        personalizationScore: 0,
        urgencyLevel: "low",
        reasons,
      };
    }

    const coldOutreachScore = this.detectColdOutreachPatterns(email.body);
    if (coldOutreachScore > EMAIL_CLASSIFICATION.COLD_OUTREACH_HIGH) {
      reasons.push("Cold outreach patterns detected in content");
      return {
        isAutomated: false,
        isNewsletter: false,
        isColdOutreach: true,
        isReply: threadHasReplies || false,
        isOutOfOffice: false,
        isBounce: false,
        personalizationScore: 1 - coldOutreachScore,
        urgencyLevel: "low",
        reasons,
      };
    }

    try {
      const llmClassification = await this.classifyWithLLM(email);
      return {
        ...llmClassification,
        isReply: threadHasReplies || false,
        isBounce: false,
        isOutOfOffice: false,
        reasons: [...reasons, ...llmClassification.reasons],
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.error("LLM classification failed", err);
      this.errorTrackingService.captureException(err, undefined, {
        operation: "classify_email",
        emailFrom: email.from,
      });
      throw err;
    }
  }

  private buildPatternReasons(
    headerClassification: {
      isAutomated: boolean;
      isNewsletter: boolean;
      isBounce: boolean;
      isOutOfOffice: boolean;
    },
    senderClassification: { isAutomated: boolean; isNewsletter: boolean },
    subjectClassification: { isAutomated: boolean; isOutOfOffice: boolean },
    from: string,
    subject: string,
  ): string[] {
    const reasons: string[] = [];
    if (headerClassification.isAutomated)
      reasons.push("Automated email detected via headers");
    if (headerClassification.isNewsletter)
      reasons.push("Newsletter detected via headers (List-Unsubscribe)");
    if (headerClassification.isBounce)
      reasons.push("Bounce/delivery notification detected via headers");
    if (headerClassification.isOutOfOffice)
      reasons.push("Out-of-office reply detected via headers");
    if (senderClassification.isAutomated && !headerClassification.isAutomated)
      reasons.push(`Automated sender pattern: ${from}`);
    if (senderClassification.isNewsletter && !headerClassification.isNewsletter)
      reasons.push(`Newsletter sender pattern: ${from}`);
    if (subjectClassification.isAutomated)
      reasons.push(`Automated subject pattern: ${subject}`);
    if (subjectClassification.isOutOfOffice)
      reasons.push(`Out-of-office subject pattern: ${subject}`);
    return reasons;
  }

  /**
   * Classify email by analyzing headers
   */
  private classifyByHeaders(headers: Record<string, string>): {
    isAutomated: boolean;
    isNewsletter: boolean;
    isBounce: boolean;
    isOutOfOffice: boolean;
  } {
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = value;
    }

    // Check Auto-Submitted header (RFC 3834)
    const autoSubmitted = normalizedHeaders["auto-submitted"];
    const isAutoSubmitted = autoSubmitted && autoSubmitted !== "no";

    // Check X-Auto-Response-Suppress header
    const autoResponseSuppress = normalizedHeaders["x-auto-response-suppress"];
    const hasAutoResponseSuppress = !!autoResponseSuppress;

    // Check Precedence header
    const { precedence } = normalizedHeaders;
    const isBulkPrecedence =
      precedence &&
      ["bulk", "junk", "list", "auto_reply"].includes(precedence.toLowerCase());

    // Check List-Unsubscribe header (newsletter indicator)
    const hasListUnsubscribe = !!normalizedHeaders["list-unsubscribe"];
    const hasListId = !!normalizedHeaders["list-id"];

    // Check for bounce indicators
    const contentType = normalizedHeaders["content-type"] || "";
    const isDeliveryStatus = contentType.includes("delivery-status");

    // Check for OOO
    const isOutOfOffice =
      autoSubmitted === AUTO_REPLY_VALUES.AUTO_REPLIED ||
      (autoResponseSuppress && autoResponseSuppress.includes("OOF"));

    return {
      isAutomated:
        !!isAutoSubmitted || hasAutoResponseSuppress || !!isBulkPrecedence,
      isNewsletter: hasListUnsubscribe || hasListId,
      isBounce: isDeliveryStatus,
      isOutOfOffice,
    };
  }

  /**
   * Classify by sender email pattern
   */
  private classifyBySender(from: string): {
    isAutomated: boolean;
    isNewsletter: boolean;
  } {
    const email = from.toLowerCase();

    const isAutomated = this.automatedPatterns.senders.some((pattern) =>
      pattern.test(email),
    );

    const isNewsletter = this.newsletterPatterns.senders.some((pattern) =>
      pattern.test(email),
    );

    return { isAutomated, isNewsletter };
  }

  /**
   * Classify by subject line pattern
   */
  private classifyBySubject(subject: string): {
    isAutomated: boolean;
    isOutOfOffice: boolean;
  } {
    const subjectLower = subject.toLowerCase();

    const isAutomated = this.automatedPatterns.subjects.some((pattern) =>
      pattern.test(subjectLower),
    );

    const isOutOfOffice =
      /out of (the )?office/i.test(subjectLower) ||
      /auto(-)?reply/i.test(subjectLower);

    return { isAutomated, isOutOfOffice };
  }

  /**
   * Detect cold outreach patterns in email body
   * Returns a score from 0 (definitely not cold outreach) to 1 (definitely cold outreach)
   */
  private detectColdOutreachPatterns(body: string): number {
    let score = 0;
    const maxScore = 5;
    const indicators: string[] = [];

    // Check for generic greetings
    for (const pattern of this.coldOutreachPatterns.greetings) {
      if (pattern.test(body)) {
        score += EMAIL_CLASSIFICATION.GENERIC_GREETING_SCORE;
        indicators.push("generic greeting");
        break;
      }
    }

    // Check for merge field artifacts
    for (const pattern of this.coldOutreachPatterns.mergeFields) {
      if (pattern.test(body)) {
        score += 2;
        indicators.push("merge field artifact");
        break;
      }
    }

    // Check for common cold outreach phrases
    let phraseMatches = 0;
    for (const pattern of this.coldOutreachPatterns.phrases) {
      if (pattern.test(body)) {
        phraseMatches++;
      }
    }
    if (phraseMatches >= 2) {
      score += EMAIL_CLASSIFICATION.GENERIC_GREETING_SCORE;
      indicators.push(`${phraseMatches} cold outreach phrases`);
    } else if (phraseMatches === 1) {
      score += EMAIL_CLASSIFICATION.SINGLE_PHRASE_SCORE;
    }

    this.logger.debug(
      `Cold outreach score: ${score}/${maxScore}, indicators: ${indicators.join(", ")}`,
    );

    return Math.min(score / maxScore, 1);
  }

  /**
   * Detect urgency level from subject and body
   */
  private detectUrgency(
    subject: string,
    body: string,
  ): "low" | "medium" | "high" {
    const text = `${subject} ${body}`.toLowerCase();

    const urgentPatterns = [
      /\burgent\b/,
      /\basap\b/,
      /\bimmediate(ly)?\b/,
      /\bcritical\b/,
      /\bemergency\b/,
      /\btime[- ]sensitive\b/,
      /\bdeadline (today|tomorrow|tonight)/,
      /\bneed(ed)? (by|before) (today|tomorrow|tonight|eod|cob)/i,
    ];

    const highUrgencyMatches = urgentPatterns.filter((pattern) =>
      pattern.test(text),
    ).length;

    if (highUrgencyMatches >= 2) return "high";
    if (highUrgencyMatches === 1) return "medium";

    // Default to medium for human emails
    return "medium";
  }

  /**
   * Use LLM to classify email content
   */
  private async classifyWithLLM(email: {
    from: string;
    fromName?: string;
    subject: string;
    body: string;
  }): Promise<EmailClassification> {
    const promptConfig = getPrompt(
      CLASSIFICATION_PROMPT_IDS.CLASSIFY_EMAIL_TYPE,
    );
    if (!promptConfig) {
      const error = new StructuralError(
        "Prompt template not found: classify_email_type. Expected file: classify-email-type.md in server/promptfoo/prompts/ directory. Please ensure the prompt template file exists.",
      );
      this.logger.error("classify_email_type prompt not found", error);
      this.errorTrackingService.captureException(error, undefined, {
        operation: CLASSIFICATION_PROMPT_IDS.CLASSIFY_EMAIL_TYPE,
        promptId: CLASSIFICATION_PROMPT_IDS.CLASSIFY_EMAIL_TYPE,
      });
      throw error;
    }

    // Clean and truncate body for LLM
    const cleanedBody = cleanEmailContent(
      email.body,
      null,
      BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
    );

    const prompt = renderPrompt(promptConfig.prompt || "", {
      from: email.from,
      fromName: email.fromName || email.from,
      subject: email.subject,
      body: cleanedBody,
    });

    const response = await this.llmService.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: LLM_CONFIG.CLASSIFICATION_MAX_TOKENS,
      },
      LLMProvider.OPENAI,
      undefined,
      LLM_OP_CLASSIFY_EMAIL,
    );

    try {
      // Parse JSON response
      let jsonString = response;
      jsonString = jsonString
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isAutomated: parsed.isAutomated || false,
          isNewsletter: parsed.isNewsletter || false,
          isColdOutreach: parsed.isColdOutreach || false,
          isReply: false,
          isOutOfOffice: parsed.isOutOfOffice || false,
          isBounce: false,
          personalizationScore:
            parsed.personalizationScore ||
            EMAIL_CLASSIFICATION.DEFAULT_PERSONALIZATION,
          urgencyLevel: parsed.urgencyLevel || "medium",
          reasons: parsed.reasons || [],
        };
      }
    } catch (error) {
      this.logger.warn("Failed to parse LLM classification response", error);
    }

    return this.getFallbackClassification();
  }

  /**
   * Get fallback classification when LLM fails
   */
  private getFallbackClassification(): EmailClassification {
    return {
      isAutomated: false,
      isNewsletter: false,
      isColdOutreach: false,
      isReply: false,
      isOutOfOffice: false,
      isBounce: false,
      personalizationScore: 0.5,
      urgencyLevel: "medium",
      reasons: ["Fallback classification"],
    };
  }

  /**
   * Check if email headers indicate this is a reply
   */
  isReplyByHeaders(headers: Record<string, string>): boolean {
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = value;
    }

    return (
      !!normalizedHeaders["in-reply-to"] || !!normalizedHeaders["references"]
    );
  }

  private buildRelevantHeadersText(
    headers: Record<string, string>,
  ): string | null {
    const RELEVANT_HEADER_KEYS = [
      "list-unsubscribe",
      "list-id",
      "precedence",
      "x-mailer",
      "x-auto-response-suppress",
      "auto-submitted",
      "x-google-dkim",
      "feedback-id",
    ];
    const normalizedHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      normalizedHeaders[key.toLowerCase()] = value;
    }
    const lines = RELEVANT_HEADER_KEYS.filter(
      (key) => normalizedHeaders[key],
    ).map((key) => `${key}: ${normalizedHeaders[key]}`);
    return lines.length > 0 ? lines.join("\n") : null;
  }

  private buildCustomExclusionPromptVars(
    email: { from: string; fromName?: string; subject: string },
    customRules: string[],
    cleanedBody: string,
    classification?: EmailClassification,
    relevantHeadersText?: string | null,
  ): Record<string, unknown> {
    return {
      rules: customRules,
      from: email.from,
      fromName: email.fromName || email.from,
      subject: email.subject,
      body: cleanedBody,
      hasClassification: !!classification,
      isAutomated: classification ? String(classification.isAutomated) : "",
      isNewsletter: classification ? String(classification.isNewsletter) : "",
      isColdOutreach: classification
        ? String(classification.isColdOutreach)
        : "",
      isBounce: classification ? String(classification.isBounce) : "",
      isOutOfOffice: classification ? String(classification.isOutOfOffice) : "",
      classificationReasons: classification
        ? classification.reasons.join(", ") || "none"
        : "",
      hasHeaders: !!relevantHeadersText,
      relevantHeaders: relevantHeadersText || "",
    };
  }

  /**
   * Check if an email matches any custom exclusion rules using AI
   * @param email Email content and metadata
   * @param customRules Array of custom exclusion rule descriptions
   * @param classification Optional pre-computed email classification
   * @param headers Optional email headers for richer context
   * @returns The matched rule description if any, or null if no rules match
   */
  async checkCustomExclusionRules(
    email: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
    },
    customRules: string[],
    classification?: EmailClassification,
    headers?: Record<string, string>,
  ): Promise<{ matched: boolean; matchedRule: string | null; reason: string }> {
    if (!customRules || customRules.length === 0) {
      return {
        matched: false,
        matchedRule: null,
        reason: "No custom rules defined",
      };
    }

    const deterministicMatch = this.matchDeterministicAutomatedRule(
      customRules,
      classification,
    );
    if (deterministicMatch) return deterministicMatch;

    try {
      const cleanedBody = cleanEmailContent(
        email.body,
        null,
        BODY_PREVIEW_LENGTHS.CLASSIFICATION_PREVIEW,
      );

      const relevantHeadersText = headers
        ? this.buildRelevantHeadersText(headers)
        : null;

      const promptConfig = getPrompt(
        CLASSIFICATION_PROMPT_IDS.CHECK_CUSTOM_EXCLUSION_RULES,
      );
      if (!promptConfig) {
        this.logger.error(
          "check_custom_exclusion_rules prompt not found, falling back to inline prompt",
        );
        return this.checkCustomExclusionRulesFallback(
          email,
          customRules,
          cleanedBody,
        );
      }

      const promptVars = this.buildCustomExclusionPromptVars(
        email,
        customRules,
        cleanedBody,
        classification,
        relevantHeadersText,
      );
      const prompt = renderPrompt(promptConfig.prompt || "", promptVars);

      const response = await this.llmService.generateText(
        {
          prompt,
          systemPrompt: promptConfig.systemPrompt || "",
          temperature: RATIOS.THIRTY_PERCENT,
          maxTokens: LLM_CONFIG.CUSTOM_RULES_MAX_TOKENS,
        },
        LLMProvider.OPENAI,
        undefined,
        LLM_OP_CHECK_CUSTOM_EXCLUSION_RULES,
      );

      // Parse JSON response
      let jsonString = response;
      jsonString = jsonString
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          matched: parsed.matched || false,
          matchedRule: parsed.matchedRule || null,
          reason: parsed.reason || "No reason provided",
        };
      }

      this.logger.warn("Failed to parse custom exclusion rules response");
      return {
        matched: false,
        matchedRule: null,
        reason: "Failed to parse LLM response",
      };
    } catch (error) {
      this.logger.error("Error checking custom exclusion rules", error);
      return {
        matched: false,
        matchedRule: null,
        reason: `Error: ${(error as Error).message}`,
      };
    }
  }

  /**
   * Deterministic pre-check: if the email is already classified as automated
   * and the user has a rule mentioning "automat*", match it immediately
   * without an LLM call. This avoids silent failures when the LLM errors out
   * (timeout/rate-limit) and ensures the user's exclusion config is respected.
   */
  private matchDeterministicAutomatedRule(
    customRules: string[],
    classification?: EmailClassification,
  ): { matched: boolean; matchedRule: string | null; reason: string } | null {
    if (!classification?.isAutomated) return null;
    const automatedRule = customRules.find((rule) => /automat/i.test(rule));
    if (!automatedRule) return null;
    this.logger.debug(
      `Deterministic pre-check matched automated rule: "${automatedRule}"`,
    );
    return {
      matched: true,
      matchedRule: automatedRule,
      reason:
        "Email was classified as automated and user has an automated-email exclusion rule",
    };
  }

  private async checkCustomExclusionRulesFallback(
    email: { from: string; fromName?: string; subject: string },
    customRules: string[],
    cleanedBody: string,
  ): Promise<{ matched: boolean; matchedRule: string | null; reason: string }> {
    const rulesText = customRules
      .map((rule, index) => `${index + 1}. ${rule}`)
      .join("\n");
    const prompt = `You are an email classification assistant. Analyze the following email and determine if it matches ANY of the user's custom exclusion rules.

CUSTOM EXCLUSION RULES:
${rulesText}

EMAIL TO ANALYZE:
From: ${email.fromName || email.from} <${email.from}>
Subject: ${email.subject}
Body:
${cleanedBody}

INSTRUCTIONS:
- Carefully read each exclusion rule and the email content
- Determine if the email matches ANY of the rules
- Be reasonably flexible in interpretation (e.g., "Automated emails" should match system notifications, auto-replies, etc.)
- If the email matches a rule, explain why

Respond with a JSON object in this exact format:
{
  "matched": true/false,
  "matchedRule": "the exact rule text that matched" or null if no match,
  "reason": "brief explanation of why it matched or didn't match"
}`;
    const response = await this.llmService.generateText(
      {
        prompt,
        systemPrompt:
          "You are an email classification assistant. Analyze emails against user-defined exclusion rules and provide structured results.",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: LLM_CONFIG.CUSTOM_RULES_MAX_TOKENS,
      },
      LLMProvider.OPENAI,
      undefined,
      LLM_OP_CHECK_CUSTOM_EXCLUSION_RULES,
    );
    const jsonString = response
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        matched: parsed.matched || false,
        matchedRule: parsed.matchedRule || null,
        reason: parsed.reason || "No reason provided",
      };
    }
    return {
      matched: false,
      matchedRule: null,
      reason: "Failed to parse LLM response",
    };
  }
}
