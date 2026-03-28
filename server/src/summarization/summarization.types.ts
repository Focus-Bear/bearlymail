/**
 * Shared types for SummarizationService.
 * Extracted to keep summarization.service.ts under the 800-line limit.
 */

import { SummarizationRule as SummarizationRuleEntity } from "../database/entities/summarization-rule.entity";
import { PhishingSignal } from "./phishing-detection.service";
import { LLMProvider } from "../llm/llm.service";
import { SummaryType } from "../llm/prompts";

export interface ThreadData {
  emailId: string;
  email: {
    body: string;
    subject?: string;
    from?: string;
    fromName?: string;
    threadId: string;
    receivedAt: Date | string;
  };
  threadText: string;
  isThread: boolean;
  messageCount: number;
  matchedRule: SummarizationRuleEntity | null;
}

export interface SummarizationRule {
  type: SummaryType;
  customPrompt?: string;
  provider?: LLMProvider;
}

export interface EmailWithHtmlBody {
  body: string;
  htmlBody?: string;
  subject?: string;
  from?: string;
  fromName?: string;
  threadId?: string;
  receivedAt?: Date | string;
}

/** Shared return type for summarize-with-phishing operations. */
export interface SummarizeWithPhishingResult {
  summary: string;
  phishingSignal: PhishingSignal | null;
  sentimentScore: number | null;
  sentimentExplanation: string | null;
  category: string | null;
  categoryExplanation: string | null;
  actionItems: Array<{ description: string; confidence: number }> | null;
}
