import {
  ConverseCommandOutput,
  SystemContentBlock,
} from "@aws-sdk/client-bedrock-runtime";

import { LLMProvider, LLMRequest } from "./llm.types";
import { LLM_OP_UNKNOWN } from "./llm-operations";
import { TokenUsageLogData } from "./token-usage.service";

/**
 * Converse cache checkpoint placed after the static system prompt so Bedrock
 * serves it from cache on subsequent calls (verified on Nova Micro in
 * ap-southeast-2: `usage.cacheWriteInputTokens` on the first call, then
 * `usage.cacheReadInputTokens` on repeats).
 */
const BEDROCK_CACHE_POINT: SystemContentBlock.CachePointMember = {
  cachePoint: { type: "default" },
};
/** Error name Bedrock raises when a model rejects `cachePoint` blocks. */
const BEDROCK_VALIDATION_EXCEPTION = "ValidationException";
const BEDROCK_CACHE_POINT_FIELD = "cachePoint";

type BedrockUsage = NonNullable<ConverseCommandOutput["usage"]>;

/**
 * Token-usage record for a Converse response, plus a log line when the
 * prompt cache was hit or written. Converse reports cached tokens separately
 * from `inputTokens`; they are folded back into `promptTokens` so volume
 * stats stay comparable with uncached calls.
 */
export function buildBedrockUsageLog(options: {
  request: LLMRequest;
  usage: BedrockUsage;
  modelId: string;
  userId?: string;
  durationMs: number;
}): { record: TokenUsageLogData; cacheLogLine: string | null } {
  const { request, usage, modelId, userId, durationMs } = options;
  const operation = request.operation || LLM_OP_UNKNOWN;
  const cacheReadTokens = usage.cacheReadInputTokens ?? 0;
  const cacheWriteTokens = usage.cacheWriteInputTokens ?? 0;
  const promptTokens =
    (usage.inputTokens ?? 0) + cacheReadTokens + cacheWriteTokens;
  const cacheLogLine =
    cacheReadTokens > 0 || cacheWriteTokens > 0
      ? `Bedrock prompt cache: read ${cacheReadTokens}, wrote ${cacheWriteTokens} of ${promptTokens} prompt tokens (${operation})`
      : null;
  return {
    cacheLogLine,
    record: {
      userId: userId || null,
      operation,
      provider: LLMProvider.BEDROCK,
      model: modelId,
      promptTokens,
      completionTokens: usage.outputTokens || 0,
      totalTokens: usage.totalTokens || 0,
      durationMs,
      promptText: request.prompt,
      systemPromptText: request.systemPrompt,
      emailIds: request.metadata?.emailIds,
    },
  };
}

/**
 * Per-process opt-in prompt caching for Bedrock Converse. A model that does
 * not support caching rejects the whole request with a ValidationException
 * mentioning `cachePoint`; once seen, every later call skips the checkpoint
 * rather than failing over to a pricier provider on every summary.
 */
export class BedrockPromptCache {
  private unsupported = false;

  /** System blocks for Converse, with a cache checkpoint when requested and still supported. */
  systemBlocks(
    systemPrompt: string | undefined,
    cacheStaticPrefix: boolean | undefined,
  ): SystemContentBlock[] | undefined {
    if (!systemPrompt) {
      return undefined;
    }
    const text: SystemContentBlock.TextMember = { text: systemPrompt };
    return cacheStaticPrefix && !this.unsupported
      ? [text, BEDROCK_CACHE_POINT]
      : [text];
  }

  /**
   * Records a cachePoint rejection and returns the warning to log, or null
   * when the error is unrelated (or caching is already disabled).
   */
  noteRejection(error: unknown, modelId: string): string | null {
    if (this.unsupported || !isCachePointRejection(error)) {
      return null;
    }
    this.unsupported = true;
    const message = error instanceof Error ? error.message : String(error);
    return `Bedrock model ${modelId} rejected prompt caching; retrying without cachePoint and disabling it for this process: ${message}`;
  }
}

function isCachePointRejection(error: unknown): boolean {
  const name = (error as { name?: string } | null)?.name;
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === BEDROCK_VALIDATION_EXCEPTION &&
    message.includes(BEDROCK_CACHE_POINT_FIELD)
  );
}
