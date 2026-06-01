import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

import { LLMProvider } from "./llm.types";
import { LLM_OP_CATEGORY_EMBEDDING, LLMOperation } from "./llm-operations";
import { TokenUsageService } from "./token-usage.service";

/** Default embedding model. Override via EMBEDDING_MODEL env var. */
const DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small";

export interface EmbedOptions {
  /** When true, embeddings are cached in-memory keyed by model and text. */
  cache?: boolean;
  /** Operation label for token-usage tracking. */
  operation?: LLMOperation;
  userId?: string | null;
}

/**
 * EmbeddingService — produces vector embeddings via OpenAI's embeddings API.
 *
 * Used to replace chat-model category shortlisting with cheap embedding
 * similarity. Category embeddings rarely change, so they are cached in-memory
 * (keyed by model + text). The cache is process-local and repopulated lazily
 * after a restart — no persistence by design.
 */
@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly client: OpenAI | null = null;
  private readonly model: string;
  private readonly cache = new Map<string, number[]>();

  constructor(
    private readonly configService: ConfigService,
    private readonly tokenUsageService: TokenUsageService,
  ) {
    this.model =
      this.configService.get<string>("EMBEDDING_MODEL") ??
      DEFAULT_EMBEDDING_MODEL;

    const apiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (apiKey) {
      this.client = new OpenAI({ apiKey });
    } else {
      this.logger.warn(
        "OPENAI_API_KEY not set — embeddings unavailable, callers will fall back",
      );
    }
  }

  /** Whether the embedding API is usable (system OpenAI key configured). */
  isAvailable(): boolean {
    return this.client !== null;
  }

  private cacheKey(text: string): string {
    return `${this.model}:${text}`;
  }

  /**
   * Embed a batch of texts, returning vectors in the same order as the input.
   *
   * With `cache: true`, previously-embedded texts are served from the in-memory
   * cache and only cache misses hit the API. Throws if the API is unavailable
   * (callers handle the fallback).
   */
  async embed(
    texts: string[],
    options: EmbedOptions = {},
  ): Promise<number[][]> {
    if (!this.client) {
      throw new Error("Embeddings unavailable: OPENAI_API_KEY not set");
    }
    if (texts.length === 0) {
      return [];
    }

    const useCache = options.cache ?? false;
    const results: Array<number[] | undefined> = new Array(texts.length);
    const misses: Array<{ index: number; text: string }> = [];

    texts.forEach((text, index) => {
      if (useCache) {
        const cached = this.cache.get(this.cacheKey(text));
        if (cached) {
          results[index] = cached;
          return;
        }
      }
      misses.push({ index, text });
    });

    if (misses.length > 0) {
      const startTime = Date.now();
      const response = await this.client.embeddings.create({
        model: this.model,
        input: misses.map((miss) => miss.text),
      });
      const durationMs = Date.now() - startTime;

      response.data.forEach((item, i) => {
        const miss = misses[i];
        if (!miss || !item) {
          return;
        }
        results[miss.index] = item.embedding;
        if (useCache) {
          this.cache.set(this.cacheKey(miss.text), item.embedding);
        }
      });

      const promptTokens = response.usage?.prompt_tokens ?? 0;
      await this.tokenUsageService.logUsage({
        userId: options.userId ?? null,
        operation: options.operation ?? LLM_OP_CATEGORY_EMBEDDING,
        provider: LLMProvider.OPENAI,
        model: this.model,
        promptTokens,
        completionTokens: 0,
        totalTokens: response.usage?.total_tokens ?? promptTokens,
        durationMs,
      });
    }

    return results as number[][];
  }
}

/**
 * Cosine similarity between two equal-length vectors. Returns 0 when either
 * vector has zero magnitude (avoids NaN).
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    magA += vecA[i] * vecA[i];
    magB += vecB[i] * vecB[i];
  }
  if (magA === 0 || magB === 0) {
    return 0;
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}
