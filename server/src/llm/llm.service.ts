import { Injectable } from "@nestjs/common";

import {
  PhishingLLMResult,
  PhishingSignals,
} from "../summarization/phishing-detection.service";
import type { LLMRequest } from "./llm.types";
import { LLMProvider } from "./llm.types";
import { LLMActionsService } from "./llm-actions.service";
import { AskAboutEmailOptions, LLMAskService } from "./llm-ask.service";
import {
  type DuplicateCategoryGroup,
  LLMCategoriesService,
} from "./llm-categories.service";
import { LLMCoreService } from "./llm-core.service";
import { LLMMiscService } from "./llm-misc.service";
import { LLMOperation } from "./llm-operations";
import { LLMPatternsService } from "./llm-patterns.service";
import { LLMReplyService } from "./llm-reply.service";
import { LLMSearchService } from "./llm-search.service";
import { LLMSummarizationService } from "./llm-summarization.service";
import { LLMToneService } from "./llm-tone.service";
import { SummaryType } from "./prompts";

// Re-export for backward compatibility with existing callers
export { LLMProvider };
export { extractPlainSummary } from "./llm-summary-utils";

/**
 * Facade service that delegates to domain-specific LLM sub-services.
 * Extracted from monolithic LLMService (Phase 7a, issue #939).
 *
 * All methods are pure delegation — no logic lives here.
 * Import the relevant domain service directly for new code.
 */
@Injectable()
export class LLMService {
  constructor(
    private readonly llmCoreService: LLMCoreService,
    private readonly llmActionsService: LLMActionsService,
    private readonly llmAskService: LLMAskService,
    private readonly llmCategoriesService: LLMCategoriesService,
    private readonly llmMiscService: LLMMiscService,
    private readonly llmPatternsService: LLMPatternsService,
    private readonly llmReplyService: LLMReplyService,
    private readonly llmSearchService: LLMSearchService,
    private readonly llmSummarizationService: LLMSummarizationService,
    private readonly llmToneService: LLMToneService,
  ) {}

  // ─── Core ────────────────────────────────────────────────────────────────

  async generateText(
    request: LLMRequest,
    provider?: LLMProvider,
    userId?: string,
    operation?: LLMOperation,
  ): Promise<string> {
    const effectiveRequest = operation ? { ...request, operation } : request;
    return this.llmCoreService.generateText(effectiveRequest, provider, userId);
  }

  getAvailableProviders(): LLMProvider[] {
    return this.llmCoreService.getAvailableProviders();
  }

  getDefaultProvider(): LLMProvider {
    return this.llmCoreService.getDefaultProvider();
  }

  // ─── Ask AI (email assistant) ──────────────────────────────────────────────

  async askAboutEmail(options: AskAboutEmailOptions): Promise<string> {
    return this.llmAskService.askAboutEmail(options);
  }

  // ─── Patterns ────────────────────────────────────────────────────────────

  async analyzeEmailPatterns(options: {
    receivedEmails: Array<{
      from: string;
      fromName?: string;
      subject: string;
      body: string;
      receivedAt: string;
      isRead?: boolean;
      timeToReply?: number | null;
      readAt?: string | null;
      repliedAt?: string | null;
      starCount?: number;
      isArchived?: boolean;
    }>;
    sentEmails: Array<{
      emailId?: string;
      to: string;
      subject: string;
      body: string;
      sentAt: string;
    }>;
    provider?: LLMProvider;
    userId?: string;
    userEmail?: string;
    currentContext?: Array<{ key: string; value: string; source?: string }>;
  }): Promise<{
    context: Array<{ key: string; value: string; source: string }>;
    writingStyle: {
      tone: string;
      style: string;
      commonPhrases: string[];
      emailExamples?: string[];
    };
  }> {
    const {
      receivedEmails,
      sentEmails,
      provider,
      userId,
      userEmail,
      currentContext,
    } = options;
    return this.llmPatternsService.analyzeEmailPatterns(
      receivedEmails,
      sentEmails,
      provider,
      userId,
      userEmail,
      currentContext,
    );
  }

  // ─── Summarization ───────────────────────────────────────────────────────

  // eslint-disable-next-line better-max-params/better-max-params
  async summarizeEmail(
    emailBody: string,
    emailSubject: string,
    summaryType: SummaryType,
    provider?: LLMProvider,
    userId?: string,
    userName?: string,
  ): Promise<string> {
    return this.llmSummarizationService.summarizeEmail(
      emailBody,
      emailSubject,
      summaryType,
      provider,
      userId,
      userName,
    );
  }

  async summarizeEmailWithPhishingCheck(options: {
    emailBody: string;
    emailSubject: string;
    summaryType: SummaryType;
    phishingSignals: PhishingSignals;
    provider?: LLMProvider;
    userId?: string;
    isUserSender?: boolean;
    from?: string;
    fromName?: string;
    userName?: string;
    existingActions?: string[];
    userTimezone?: string;
  }): Promise<{
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
    const {
      emailBody,
      emailSubject,
      summaryType,
      phishingSignals,
      provider,
      userId,
      isUserSender = false,
      from = "",
      fromName = "",
      userName = "",
      existingActions = [],
      userTimezone = "UTC",
    } = options;
    return this.llmSummarizationService.summarizeEmailWithPhishingCheck(
      emailBody,
      emailSubject,
      summaryType,
      phishingSignals,
      provider,
      userId,
      isUserSender,
      from,
      fromName,
      existingActions,
      userTimezone,
      userName,
    );
  }

  async summarizeCustomPromptWithPhishing(options: {
    emailBody: string;
    emailSubject: string;
    customPrompt: string;
    phishingSignals: PhishingSignals;
    isThread: boolean;
    totalMessageCount: number;
    provider?: LLMProvider;
    userId?: string;
  }): Promise<{
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
    const {
      emailBody,
      emailSubject,
      customPrompt,
      phishingSignals,
      isThread,
      totalMessageCount,
      provider,
      userId,
    } = options;
    return this.llmSummarizationService.summarizeCustomPromptWithPhishing(
      emailBody,
      emailSubject,
      customPrompt,
      phishingSignals,
      isThread,
      totalMessageCount,
      provider,
      userId,
    );
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
    return this.llmSummarizationService.summarizeThreads(
      threads,
      provider,
      userId,
      customInstructions,
      emailIds,
    );
  }

  // ─── Tone ────────────────────────────────────────────────────────────────

  async checkTone(options: {
    text: string;
    rules?: string[];
    provider?: LLMProvider;
    userId?: string;
    scheduledSendAt?: string | null;
    currentTime?: string | null;
  }): Promise<{
    isOk: boolean;
    significance?: "low" | "medium" | "high";
    suggestions: string[];
    revisedText?: string;
    attachmentReminder?: string | null;
    inappropriateTiming?: string | null;
  }> {
    const {
      text,
      rules = ["Be concise", "Use non-violent communication"],
      provider,
      userId,
      scheduledSendAt,
      currentTime,
    } = options;
    return this.llmToneService.checkTone(
      text,
      rules,
      provider,
      userId,
      scheduledSendAt,
      currentTime,
    );
  }

  async disputeToneCheck(options: {
    emailText: string;
    rules: string[];
    suggestions: string[];
    userArgument: string;
    provider?: LLMProvider;
    userId?: string;
  }): Promise<{
    accepted: boolean;
    rulesToRemove: string[];
    explanation: string;
  }> {
    const { emailText, rules, suggestions, userArgument, provider, userId } =
      options;
    return this.llmToneService.disputeToneCheck(
      emailText,
      rules,
      suggestions,
      userArgument,
      provider,
      userId,
    );
  }

  async redactNamesWithLLM(text: string): Promise<string> {
    return this.llmToneService.redactNamesWithLLM(text);
  }

  async validateWritingExample(text: string): Promise<string | null> {
    return this.llmToneService.validateWritingExample(text);
  }

  // ─── Actions ─────────────────────────────────────────────────────────────

  async extractActionItems(options: {
    emailBody: string;
    provider?: LLMProvider;
    userId?: string;
    senderInfo?: { from: string; fromName?: string };
    recipientInfo?: { name?: string; email?: string };
    isUserSender?: boolean;
    existingActions?: string[];
    subject?: string;
    userName?: string;
  }): Promise<Array<{ description: string; confidence: number }>> {
    const {
      emailBody,
      provider,
      userId,
      senderInfo,
      recipientInfo,
      isUserSender = false,
      existingActions = [],
      subject,
      userName = "",
    } = options;
    return this.llmActionsService.extractActionItems(
      emailBody,
      provider,
      userId,
      senderInfo,
      recipientInfo,
      isUserSender,
      existingActions,
      subject,
      userName,
    );
  }

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
    return this.llmActionsService.detectSuggestedActions(
      emailContent,
      emailMetadata,
      provider,
      userId,
    );
  }

  // ─── Reply ───────────────────────────────────────────────────────────────

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
      calendarLink?: string | null;
      userInstructions?: string;
    },
    provider?: LLMProvider,
    userId?: string,
    threadMessages?: Array<{
      from: string;
      fromName?: string;
      body: string;
      receivedAt: Date;
      isFromUser: boolean;
    }>,
  ): Promise<Array<{ label: string; text: string }>> {
    return this.llmReplyService.generateReplyOptions(
      originalEmail,
      userContext,
      provider,
      userId,
      threadMessages,
    );
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
    return this.llmReplyService.generateReplyDraft(
      originalEmail,
      userContext,
      provider,
      userId,
    );
  }

  // eslint-disable-next-line better-max-params/better-max-params
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
    userContext?: {
      tone?: string;
      commonPhrases?: string[];
      writingStyle?: string;
      emailExamples?: string[];
    },
  ): Promise<string> {
    return this.llmReplyService.generateMeetingReply(
      originalEmail,
      availableSlots,
      calendarBookingUrl,
      provider,
      userId,
      userContext,
    );
  }

  async generateFollowUpDraft(options: {
    subject: string;
    threadMessages: Array<{
      from: string;
      fromName?: string;
      body: string;
      receivedAt: Date;
      isFromUser: boolean;
    }>;
    theirName: string;
    businessDaysWaiting: number;
    userCommunicationStyle?: { tone?: string; commonPhrases?: string[] };
    provider?: LLMProvider;
    userId?: string;
    threadStyleInfo?: {
      preferredName?: string | null;
      greetingStyle?: string | null;
    };
    calendarBookingUrl?: string | null;
    lastOtherPartyMessage?: string;
    userLastMessage?: string;
  }): Promise<string> {
    const {
      subject,
      threadMessages,
      theirName,
      businessDaysWaiting,
      userCommunicationStyle,
      provider,
      userId,
      threadStyleInfo,
      calendarBookingUrl,
      lastOtherPartyMessage,
      userLastMessage,
    } = options;
    return this.llmReplyService.generateFollowUpDraft(
      subject,
      threadMessages,
      theirName,
      businessDaysWaiting,
      userCommunicationStyle,
      provider,
      userId,
      threadStyleInfo,
      calendarBookingUrl,
      lastOtherPartyMessage,
      userLastMessage,
    );
  }

  // ─── Search ──────────────────────────────────────────────────────────────

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
    return this.llmSearchService.generateSearchRelevanceExplanation(
      query,
      email,
      userId,
      provider,
    );
  }

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
    return this.llmSearchService.generateSearchRelevanceExplanationsBatch(
      query,
      emails,
      userId,
      provider,
    );
  }

  // ─── Categories ──────────────────────────────────────────────────────────

  async consolidateEmailCategories(
    autoGeneratedCategories: Array<{ name: string; description: string }>,
    userAddedCategories: Array<{ name: string; description: string }>,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<
    Array<{ name: string; description: string; isUserAdded: boolean }>
  > {
    return this.llmCategoriesService.consolidateEmailCategories(
      autoGeneratedCategories,
      userAddedCategories,
      provider,
      userId,
    );
  }

  async identifyDuplicateCategories(
    familyName: string,
    categories: Array<{ name: string; description: string }>,
    provider?: LLMProvider,
    userId?: string,
    crossFamily?: boolean,
  ): Promise<DuplicateCategoryGroup[]> {
    return this.llmCategoriesService.identifyDuplicateCategories(
      familyName,
      categories,
      provider,
      userId,
      crossFamily,
    );
  }

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
    return this.llmCategoriesService.generateCategoriesFromOther(
      otherEmails,
      existingCategories,
      provider,
      userId,
    );
  }

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
    return this.llmCategoriesService.identifyCustomLabels(
      labels,
      provider,
      userId,
    );
  }

  // ─── Misc ────────────────────────────────────────────────────────────────

  async analyzeOverrideReason(options: {
    email: {
      from: string;
      fromName?: string | null;
      subject: string;
      body: string;
    };
    reasonType: string;
    reasonText: string;
    currentContext: Array<{
      contextKey: string;
      contextValue: string;
      priority?: number | null;
    }>;
    provider?: LLMProvider;
    userId?: string;
  }): Promise<{
    suggestedRules: string[];
    updatedContexts: Array<{
      contextKey: string;
      contextValue: string;
      priority?: number;
    }>;
  }> {
    const { email, reasonType, reasonText, currentContext, provider, userId } =
      options;
    return this.llmMiscService.analyzeOverrideReason(
      email,
      reasonType,
      reasonText,
      currentContext,
      provider,
      userId,
    );
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
    return this.llmMiscService.extractQAndA(userReplies, userId, provider);
  }

  async compressUserContext(
    items: Array<{
      key: string;
      value: string;
      priority?: number;
      explanation?: string;
    }>,
    maxItemsPerKey: number,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<{
    items: Array<{
      key: string;
      value: string;
      priority?: number;
      explanation?: string;
    }>;
    notes?: string;
  }> {
    return this.llmMiscService.compressUserContext(
      items,
      maxItemsPerKey,
      provider,
      userId,
    );
  }

  // ─── Calendar / Meeting ───────────────────────────────────────────────────

  async detectMeetingProposal(
    email: {
      from: string;
      fromName?: string;
      subject: string;
      body: string;
      priorMessages?: Array<{ from: string; fromName?: string; body: string }>;
    },
    provider?: LLMProvider,
    userId?: string,
    userTimezone?: string,
  ): Promise<{
    hasProposal: boolean;
    proposedTime: string | null;
    windowEnd: string | null;
    proposedDate: string | null;
    proposedTimeText: string | null;
    topic: string | null;
    durationMinutes: number | null;
  }> {
    return this.llmReplyService.detectMeetingProposal(
      email,
      provider,
      userId,
      userTimezone,
    );
  }
}
