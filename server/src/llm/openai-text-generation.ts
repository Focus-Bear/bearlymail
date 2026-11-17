import OpenAI from "openai";

import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import type {
  LoggerPort,
  TokenUsageSink,
} from "../shared/email-intelligence/ports";
import { LLMProvider, LLMRequest } from "./llm.types";
import { LLM_OP_UNKNOWN } from "./llm-operations";

/** One OpenAI text generation, on whichever client (BearlyMail's or the user's own) the caller chose. */
export interface OpenAITextGeneration {
  openaiClient: OpenAI;
  request: LLMRequest;
  model: string;
  userId: string | undefined;
  startTime: number;
  tokenUsage: TokenUsageSink;
  logger: Pick<LoggerPort, "error">;
}

/** Reasoning-capable models go through the Responses API. */
export async function generateWithOpenAIReasoningModel(
  options: OpenAITextGeneration & { reasoningEffort: string },
): Promise<string> {
  const {
    openaiClient,
    request,
    model,
    reasoningEffort,
    userId,
    startTime,
    tokenUsage,
    logger,
  } = options;
  if (
    !openaiClient.responses ||
    typeof openaiClient.responses.create !== "function"
  ) {
    const sdkError = new Error(
      `OpenAI SDK does not support responses.create() - the Responses API requires openai SDK v4.87.0+. ` +
        `Current model ${model} requires this API for reasoning support. ` +
        `Consider upgrading the openai package or switching to a non-reasoning model.`,
    );
    logger.error(sdkError.message);
    throw sdkError;
  }

  const responseParams: {
    model: string;
    reasoning: { effort: "low" | "medium" | "high" };
    input: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    max_output_tokens: number;
    text?: { format: { type: "json_object" } };
    instructions?: string;
  } = {
    model,
    reasoning: { effort: reasoningEffort as "low" | "medium" | "high" },
    input: [{ role: "user" as const, content: request.prompt }],
    max_output_tokens: request.maxTokens || QUERY_LIMITS.LLM_CONTEXT_WINDOW,
    ...(request.jsonMode && {
      text: { format: { type: "json_object" as const } },
    }),
  };

  if (request.systemPrompt) {
    responseParams.instructions = request.systemPrompt;
  }

  const response = await openaiClient.responses.create(responseParams);
  const durationMs = Date.now() - startTime;

  if (response.usage) {
    await tokenUsage.logUsage({
      userId: userId || null,
      operation: request.operation || LLM_OP_UNKNOWN,
      provider: LLMProvider.OPENAI,
      model,
      promptTokens: response.usage.input_tokens || 0,
      completionTokens: response.usage.output_tokens || 0,
      totalTokens: response.usage.total_tokens || 0,
      durationMs,
      promptText: request.prompt,
      systemPromptText: request.systemPrompt,
      emailIds: request.metadata?.emailIds,
    });
  }
  return response.output_text || "";
}

/** Chat Completions for non-reasoning models. */
export async function generateWithOpenAIStandardModel(
  options: OpenAITextGeneration,
): Promise<string> {
  const { openaiClient, request, model, userId, startTime, tokenUsage } =
    options;
  const messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }> = [];
  if (request.systemPrompt) {
    messages.push({ role: "system", content: request.systemPrompt });
  }
  messages.push({ role: "user", content: request.prompt });

  const completionParams: {
    model: string;
    messages: typeof messages;
    temperature: number;
    max_completion_tokens: number;
    response_format?: { type: "json_object" };
  } = {
    model,
    messages,
    temperature: request.temperature || RATIOS.SEVENTY_PERCENT,
    max_completion_tokens: request.maxTokens || QUERY_LIMITS.LLM_CONTEXT_WINDOW,
    ...(request.jsonMode && {
      response_format: { type: "json_object" as const },
    }),
  };

  const completion =
    await openaiClient.chat.completions.create(completionParams);
  const durationMs = Date.now() - startTime;

  if (completion.usage) {
    await tokenUsage.logUsage({
      userId: userId || null,
      operation: request.operation || LLM_OP_UNKNOWN,
      provider: LLMProvider.OPENAI,
      model,
      promptTokens: completion.usage.prompt_tokens || 0,
      completionTokens: completion.usage.completion_tokens || 0,
      totalTokens: completion.usage.total_tokens || 0,
      durationMs,
      promptText: request.prompt,
      systemPromptText: request.systemPrompt,
      emailIds: request.metadata?.emailIds,
    });
  }
  return completion.choices[0]?.message?.content || "";
}
