import { Injectable, Logger } from "@nestjs/common";

import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { StructuralError } from "../errors/structural-error";
import { cleanEmailContent } from "./email-content-cleaner";
import type { LLMProvider } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import { LLM_OP_ASK_AI_EMAIL } from "./llm-operations";
import { ASSISTANT_PROMPT_IDS, getPrompt, renderPrompt } from "./prompts";

export const ASK_AI_ROLE_USER = "user" as const;
export const ASK_AI_ROLE_ASSISTANT = "assistant" as const;

/** A single prior turn in the Ask-AI conversation. */
export interface AskAiTurn {
  role: typeof ASK_AI_ROLE_USER | typeof ASK_AI_ROLE_ASSISTANT;
  content: string;
}

export interface AskAboutEmailOptions {
  subject: string;
  from: string;
  fromName: string;
  body: string;
  isThread: boolean;
  question: string;
  /** Prior turns of the current conversation, oldest first. */
  history?: AskAiTurn[];
  userId?: string;
  provider?: LLMProvider;
}

/**
 * Domain service for the "Ask AI" email assistant — free-form Q&A grounded in
 * the single email/thread the user has open. Answers are constrained to the
 * provided email content by the ask-ai-email prompt; nothing is persisted.
 */
@Injectable()
export class LLMAskService {
  private readonly logger = new Logger(LLMAskService.name);

  /** Cap conversation history fed back to the model to keep prompts bounded. */
  private static readonly MAX_HISTORY_TURNS = 8;

  constructor(private readonly llmCoreService: LLMCoreService) {}

  async askAboutEmail(options: AskAboutEmailOptions): Promise<string> {
    const {
      subject,
      from,
      fromName,
      body,
      isThread,
      question,
      history,
      userId,
      provider,
    } = options;

    const promptConfig = getPrompt(ASSISTANT_PROMPT_IDS.ASK_AI_EMAIL);
    if (!promptConfig) {
      throw new StructuralError(
        `Prompt template not found: ${ASSISTANT_PROMPT_IDS.ASK_AI_EMAIL}. Expected file: ask-ai-email.md in server/promptfoo/prompts/ directory.`,
      );
    }

    const cleanedBody = cleanEmailContent(
      body,
      null,
      QUERY_LIMITS.LLM_BODY_PREVIEW_LENGTH,
    );

    const boundedHistory = (history ?? []).slice(
      -LLMAskService.MAX_HISTORY_TURNS,
    );

    const prompt = renderPrompt(promptConfig.prompt || "", {
      subject: subject || "(no subject)",
      from,
      fromName: fromName || from || "Unknown sender",
      isThread,
      body: cleanedBody,
      hasHistory: boundedHistory.length > 0,
      history: boundedHistory,
      question,
    });

    const answer = await this.llmCoreService.generateText(
      {
        prompt,
        systemPrompt: promptConfig.systemPrompt || "",
        temperature: RATIOS.THIRTY_PERCENT,
        maxTokens: QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        userId,
        operation: LLM_OP_ASK_AI_EMAIL,
      },
      provider,
      userId,
    );

    return answer.trim();
  }
}
