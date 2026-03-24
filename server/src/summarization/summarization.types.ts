/**
 * Shared types for SummarizationService.
 * Extracted to keep summarization.service.ts under the 800-line limit.
 */

import { SummarizationRule as SummarizationRuleEntity } from "../database/entities/summarization-rule.entity";
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
