import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import { GenerateContentResponse, GoogleGenAI } from "@google/genai";
import OpenAI from "openai";

import { LLM_BLOCK_TYPES } from "../constants/domain-types";
import { JEV } from "../constants/jev.constants";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";
import {
  USER_AI_PROVIDERS,
  type UserAiProvider,
} from "../constants/user-ai-providers.constants";
import {
  fromAnthropicMessage,
  toAnthropicMessages,
  toAnthropicTools,
} from "./anthropic-tool-translation";
import {
  BedrockPromptCache,
  buildBedrockUsageLog,
} from "./bedrock-prompt-cache";
import { ClaudeCliClient } from "./claude-cli.helper";
import { buildGeminiGenerationConfig } from "./gemini-request.helper";
import { JevCategoryClient, type JevDeclinedPick } from "./jev-category-client";
import { JevDecisionClient } from "./jev-decisions/jev-decision-client";
import { LLMProvider, LLMRequest } from "./llm.types";
import type {
  CategoriseFromSummaryParams,
  CategoriseFromSummaryResult,
} from "./llm-categorise-summary";
import { LLM_OP_UNKNOWN, LLMOperation } from "./llm-operations";
import {
  isGeminiBillingError,
  LLM_RETRY_MAX_ATTEMPTS,
  retryLLMOperation,
} from "./llm-retry-policy";
import { supportsReasoningEffort } from "./llm-utils";
import {
  generateWithOpenAIReasoningModel,
  generateWithOpenAIStandardModel,
} from "./openai-text-generation";
import { reportProvider } from "./provider-report.util";
import { TokenUsageService } from "./token-usage.service";
import { UserAiKeysService } from "./user-ai-keys.service";
import {
  isAuthFailure,
  type JevCredentials,
  type OwnProviderAttempt,
  planOwnProviderAttempts,
  selectJevCredentials,
  UserAiKeyRejectedException,
  type UserAiKeys,
  usesOwnAiAccount,
} from "./user-ai-routing";

/** Parameters for a single provider-agnostic tool-calling step. */
export interface ToolChatParams {
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  tools?: OpenAI.Chat.Completions.ChatCompletionTool[];
  userId?: string;
  operation?: LLMOperation;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
  /** Abort signal to cancel the in-flight request. */
  signal?: AbortSignal;
}

/**
 * How long to skip Gemini after we see a billing-depletion 429. Calls during
 * this window fail fast and fall back to OpenAI without ever hitting Google.
 */
const GEMINI_BILLING_CIRCUIT_MS = 5 * MILLISECONDS.MINUTE;

/**
 * Gemini API version to target. We use `v1beta` (also the SDK default): it
 * supports systemInstruction, responseMimeType (JSON mode), responseSchema
 * (structured output), and thinkingConfig for every model we run — the
 * gemini-3.1-flash-lite primary (the code default when GEMINI_MODEL is unset,
 * which prod is) and the gemini-3.6-flash dedup model. `v1` was briefly
 * considered to resolve "gemini-3.1-flash", but no such model exists (the 3.1
 * generation ships only -lite / -image), and `v1` also rejects JSON mode for the
 * older 2.x flash models — so `v1` offered no upside. All models above were
 * verified live against the prod key to resolve + do JSON on v1beta.
 */
const GEMINI_API_VERSION = "v1beta";

/**
 * Bedrock defaults. The org SCP denies bedrock:InvokeModel in us-east-1, and
 * Nova is enabled in the account's home region, so we pin ap-southeast-2.
 * Amazon Nova Micro is the cheapest text model — used for summarisation.
 */
const DEFAULT_BEDROCK_REGION = "ap-southeast-2";
const DEFAULT_BEDROCK_MODEL = "amazon.nova-micro-v1:0";
/** Nova Micro caps output at ~5k tokens; clamp so an oversized budget can't 400. */
const BEDROCK_MAX_OUTPUT_TOKENS = 5000;

const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini";
const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6";

type ApiKeySource = "system" | "user";

/** Where to send settings-related errors in user-facing messages. */
const OWN_AI_ACCOUNT_SETTINGS_HINT = "Settings → Use your own AI account";

@Injectable()
export class LLMCoreService {
  private readonly logger = new Logger(LLMCoreService.name);
  private geminiClient: GoogleGenAI | null = null;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private bedrockClient: BedrockRuntimeClient | null = null;
  private defaultProvider: LLMProvider;
  /**
   * Epoch ms after which Gemini calls are allowed again. 0 = circuit closed.
   * Per-process state (web and worker each maintain their own breaker).
   */
  private geminiBillingCircuitOpenUntil = 0;
  /** Opt-in Converse prompt caching; disables itself if the model rejects it. */
  private readonly bedrockPromptCache = new BedrockPromptCache();
  /** Local Claude Code CLI wrapper (binary probe + one-shot generations). */
  private readonly claudeCli: ClaudeCliClient;
  private readonly jevCategories: JevCategoryClient;
  private readonly jevDecisions: JevDecisionClient;

  constructor(
    private configService: ConfigService,
    private userAiKeys: UserAiKeysService,
    private tokenUsageService: TokenUsageService,
  ) {
    this.claudeCli = new ClaudeCliClient(
      (key) => this.configService.get<string>(key),
      this.logger,
      this.tokenUsageService,
    );
    this.jevCategories = new JevCategoryClient(
      (key) => this.configService.get<string>(key),
      this.logger,
      this.tokenUsageService,
    );
    this.jevDecisions = new JevDecisionClient(
      (key) => this.configService.get<string>(key),
      this.logger,
      this.tokenUsageService,
    );
    this.initializeClients();
    this.defaultProvider = (
      this.configService.get<string>("LLM_PROVIDER") || "gemini"
    ).toLowerCase() as LLMProvider;
    if (
      this.defaultProvider === LLMProvider.CLAUDE_CLI &&
      !this.claudeCli.isAvailable()
    ) {
      this.logger.warn(
        `Claude CLI binary not found (CLAUDE_CLI_PATH=${this.claudeCli.cliPath}), claude-cli will be unavailable`,
      );
    }
  }

  async categoriseWithJev(
    params: CategoriseFromSummaryParams,
    onDeclined?: (pick: JevDeclinedPick) => void,
  ): Promise<CategoriseFromSummaryResult | null> {
    const keys = await this.findUserKeys(params.userId);
    return this.jevCategories.categorise(
      params,
      this.jevCredentialsFor(keys, params.userId),
      onDeclined,
    );
  }

  /**
   * The user's own AI provider keys. Every AI entry point reads them first:
   * a user on their own AI account (see usesOwnAiAccount) never has a call
   * sent to BearlyMail's provider accounts.
   */
  private async findUserKeys(userId?: string | null): Promise<UserAiKeys> {
    if (!userId) return {};
    return this.userAiKeys.findKeys(userId);
  }

  private jevCredentialsFor(
    keys: UserAiKeys,
    userId?: string | null,
  ): JevCredentials | null {
    return selectJevCredentials(
      keys,
      this.configService.get<string>(JEV.API_KEY_ENV),
      () => {
        if (userId) this.recordRejectedKey(userId, USER_AI_PROVIDERS.TYPESAFE);
      },
    );
  }

  /** Remembers a refused key so Settings can tell the user; never blocks the call path. */
  private recordRejectedKey(userId: string, provider: UserAiProvider): void {
    this.userAiKeys.markRejected(userId, provider).catch((error: unknown) => {
      this.logger.warn(
        `Could not record the rejected ${provider} key for user ${userId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private initializeClients() {
    // Initialize Gemini
    const geminiApiKey = this.configService.get<string>("GEMINI_API_KEY");
    if (geminiApiKey) {
      try {
        this.geminiClient = new GoogleGenAI({
          apiKey: geminiApiKey,
          apiVersion: GEMINI_API_VERSION,
        });
        this.logger.log("Gemini client initialized");
      } catch (error) {
        this.logger.error("Failed to initialize Gemini client", error);
      }
    } else {
      this.logger.warn("GEMINI_API_KEY not found, Gemini will be unavailable");
    }

    // Initialize OpenAI
    const openaiApiKey = this.configService.get<string>("OPENAI_API_KEY");
    if (openaiApiKey) {
      try {
        this.openaiClient = new OpenAI({ apiKey: openaiApiKey });
        this.logger.log("OpenAI client initialized");
      } catch (error) {
        this.logger.error("Failed to initialize OpenAI client", error);
      }
    } else {
      this.logger.warn("OPENAI_API_KEY not found, OpenAI will be unavailable");
    }

    // Initialize Anthropic (optional system key; users can supply their own)
    const anthropicApiKey = this.configService.get<string>("ANTHROPIC_API_KEY");
    if (anthropicApiKey) {
      try {
        this.anthropicClient = new Anthropic({ apiKey: anthropicApiKey });
        this.logger.log("Anthropic client initialized");
      } catch (error) {
        this.logger.error("Failed to initialize Anthropic client", error);
      }
    } else {
      this.logger.warn(
        "ANTHROPIC_API_KEY not set — Anthropic will use user keys only",
      );
    }

    // Initialize AWS Bedrock (Amazon Nova). Credentials come from the default
    // AWS chain — the ECS task role in prod, or SSO/profile locally — so no API
    // key is needed. Region is pinned (see DEFAULT_BEDROCK_REGION).
    try {
      this.bedrockClient = new BedrockRuntimeClient({
        region:
          this.configService.get<string>("BEDROCK_REGION") ||
          DEFAULT_BEDROCK_REGION,
      });
      this.logger.log("Bedrock client initialized");
    } catch (error) {
      this.logger.error("Failed to initialize Bedrock client", error);
    }
  }

  async generateText(
    request: LLMRequest,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string> {
    const effectiveUserId = userId || request.userId;
    const keys = await this.findUserKeys(effectiveUserId);
    const jevOutput = await this.jevDecisions.decide(
      request,
      effectiveUserId,
      this.jevCredentialsFor(keys, effectiveUserId),
    );
    if (jevOutput !== null) return jevOutput;
    if (effectiveUserId && usesOwnAiAccount(keys)) {
      return this.generateOnOwnAccount(
        request,
        provider || this.defaultProvider,
        keys,
        effectiveUserId,
      );
    }
    return this.generateWithProviderFallback(request, provider, userId);
  }

  /**
   * Generation for a user on their own AI account: only their keys, tried in
   * planOwnProviderAttempts order. A refused key is recorded and surfaced as
   * UserAiKeyRejectedException; nothing falls back to BearlyMail's keys.
   */
  private async generateOnOwnAccount(
    request: LLMRequest,
    requested: LLMProvider,
    keys: UserAiKeys,
    userId: string,
  ): Promise<string> {
    return this.runOnOwnAccount(
      planOwnProviderAttempts(keys, requested, request.model),
      userId,
      (attempt) => {
        const attemptRequest = { ...request, model: attempt.model };
        return attempt.provider === LLMProvider.ANTHROPIC
          ? this.generateWithAnthropicClient(
              attemptRequest,
              new Anthropic({ apiKey: attempt.apiKey }),
              "user",
              userId,
            )
          : this.generateWithOpenAIClient(
              attemptRequest,
              new OpenAI({ apiKey: attempt.apiKey }),
              "user",
              userId,
            );
      },
    );
  }

  /**
   * Tries each of the user's providers until one answers. Aborts stop at
   * once; a refused key is recorded and reported in preference to any other
   * failure, since it is the one the user can fix.
   */
  private async runOnOwnAccount<T>(
    attempts: OwnProviderAttempt[],
    userId: string,
    run: (attempt: OwnProviderAttempt) => Promise<T>,
  ): Promise<T> {
    let rejection: UserAiKeyRejectedException | undefined;
    let lastError: unknown;
    for (const attempt of attempts) {
      try {
        return await run(attempt);
      } catch (error) {
        if (this.isAbortError(error)) throw error;
        if (isAuthFailure(error)) {
          this.recordRejectedKey(userId, attempt.userProvider);
          rejection ??= new UserAiKeyRejectedException(attempt.userProvider);
        } else {
          lastError = error;
        }
        this.logger.warn(
          `User ${userId}'s own ${attempt.provider} key failed${isAuthFailure(error) ? " (rejected)" : ""}`,
        );
      }
    }
    throw rejection ?? lastError;
  }

  private async generateWithProviderFallback(
    request: LLMRequest,
    provider?: LLMProvider,
    userId?: string,
  ): Promise<string> {
    const selectedProvider = provider || this.defaultProvider;
    const effectiveUserId = userId || request.userId;

    try {
      switch (selectedProvider) {
        case LLMProvider.GEMINI:
          return await this.generateWithGemini(request, effectiveUserId);
        case LLMProvider.OPENAI:
          return await this.generateWithOpenAI(request, effectiveUserId);
        case LLMProvider.ANTHROPIC:
          return await this.generateWithAnthropic(request, effectiveUserId);
        case LLMProvider.BEDROCK:
          return await this.generateWithBedrock(request, effectiveUserId);
        case LLMProvider.CLAUDE_CLI:
          return await this.generateWithClaudeCli(request, effectiveUserId);
        default:
          throw new Error(`Unsupported LLM provider: ${selectedProvider}`);
      }
    } catch (error) {
      this.logger.error(
        `Error generating text with ${selectedProvider}`,
        error,
      );
      // Fallback to the other provider if available. Strip `request.model`
      // before falling back — it may name a provider-specific model (e.g.
      // "gemini-3.1-flash-lite") that the fallback provider would reject.
      const fallbackRequest: LLMRequest = { ...request, model: undefined };
      if (selectedProvider === LLMProvider.GEMINI) {
        this.logger.log(`Gemini failed, falling back to OpenAI`);
        return await this.generateWithOpenAI(fallbackRequest, effectiveUserId);
      } else if (selectedProvider === LLMProvider.OPENAI) {
        this.logger.log(`OpenAI failed, falling back to Gemini`);
        return await this.generateWithGemini(fallbackRequest, effectiveUserId);
      } else if (
        selectedProvider === LLMProvider.BEDROCK &&
        (this.geminiClient || this.openaiClient)
      ) {
        // Keep Bedrock-routed ops working when Bedrock is unavailable: prefer
        // Gemini, but OpenAI-only self-hosted installs fall back to OpenAI.
        this.logger.log(`Bedrock failed, falling back to a cloud provider`);
        return this.geminiClient
          ? await this.generateWithGemini(fallbackRequest, effectiveUserId)
          : await this.generateWithOpenAI(fallbackRequest, effectiveUserId);
      } else if (
        selectedProvider === LLMProvider.CLAUDE_CLI &&
        (this.openaiClient || this.geminiClient)
      ) {
        // The local CLI can be missing or broken; keep features working by
        // falling back to a configured cloud provider. Cloud providers never
        // fall back TO the CLI.
        const useOpenAi = Boolean(this.openaiClient);
        this.logger.log(`Claude CLI failed, falling back to a cloud provider`);
        return useOpenAi
          ? await this.generateWithOpenAI(fallbackRequest, effectiveUserId)
          : await this.generateWithGemini(fallbackRequest, effectiveUserId);
      }
      throw error;
    }
  }

  /**
   * Retries `operation` with exponential backoff. Rate-limit errors switch to
   * the longer `RATE_LIMIT_RETRY_*` schedule so a throttled cheap model is
   * waited out rather than handed to the expensive fallback provider.
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = LLM_RETRY_MAX_ATTEMPTS,
  ): Promise<T> {
    return retryLLMOperation(operation, this.logger, maxRetries);
  }

  private isGeminiCircuitOpen(): boolean {
    return Date.now() < this.geminiBillingCircuitOpenUntil;
  }

  private tripGeminiBillingCircuit(): void {
    // Multiple in-flight calls can all see the billing 429 at once. Only the
    // first one to trip logs — the rest would just be log spam.
    const wasOpen = this.isGeminiCircuitOpen();
    this.geminiBillingCircuitOpenUntil = Date.now() + GEMINI_BILLING_CIRCUIT_MS;
    if (!wasOpen) {
      this.logger.warn(
        `Gemini billing 429 (prepayment credits depleted) — opening circuit for ${GEMINI_BILLING_CIRCUIT_MS / MILLISECONDS.MINUTE} minutes; falling back to OpenAI in the meantime.`,
      );
    }
  }

  private async generateWithGemini(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    // Note: Gemini doesn't support user-specific API keys, always uses system key
    if (!this.geminiClient) {
      throw new Error("Gemini client not initialized");
    }
    // Circuit breaker: after a billing 429, skip Gemini entirely for a window
    // so we don't keep hammering a paywall. Bypass straight to OpenAI rather
    // than throwing — throwing would emit a noisy ERROR-with-stack-trace log
    // per request via the outer `generateText` catch, for the whole window.
    // Strip `request.model` because it may name a Gemini-specific model.
    if (this.isGeminiCircuitOpen()) {
      return this.generateWithOpenAI({ ...request, model: undefined }, userId);
    }

    // Callers can request a specific Gemini model (e.g. the stronger non-lite
    // model for dedup decisions). Falls back to the configured default.
    const modelName =
      request.model ||
      this.configService.get<string>("GEMINI_MODEL") ||
      "gemini-3.1-flash-lite";
    this.logger.log(
      `Generating text using Gemini model: ${modelName}${request.thinking ? " (thinking enabled)" : ""}`,
    );

    return this.retryOperation(async () => {
      const startTime = Date.now();
      const config = buildGeminiGenerationConfig(request);

      let response: GenerateContentResponse;
      try {
        response = await this.geminiClient!.models.generateContent({
          model: modelName,
          contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          config,
        });
      } catch (error) {
        // Trip the circuit breaker the moment we see a billing 429 so any
        // calls already queued behind us skip Gemini and fall back to OpenAI.
        if (isGeminiBillingError(error)) {
          this.tripGeminiBillingCircuit();
        }
        throw error;
      }

      const durationMs = Date.now() - startTime;
      const { usageMetadata } = response;
      if (usageMetadata) {
        const cachedTokens = usageMetadata.cachedContentTokenCount || 0;
        if (cachedTokens > 0) {
          this.logger.log(
            `Gemini implicit cache hit: ${cachedTokens}/${usageMetadata.promptTokenCount || 0} prompt tokens cached (${request.operation || LLM_OP_UNKNOWN})`,
          );
        }
        await this.tokenUsageService.logUsage({
          userId: userId || null,
          operation: request.operation || LLM_OP_UNKNOWN,
          provider: LLMProvider.GEMINI,
          model: modelName,
          promptTokens: usageMetadata.promptTokenCount || 0,
          completionTokens: usageMetadata.candidatesTokenCount || 0,
          totalTokens: usageMetadata.totalTokenCount || 0,
          durationMs,
          // Pass prompt text for example capture
          promptText: request.prompt,
          systemPromptText: request.systemPrompt,
          emailIds: request.metadata?.emailIds,
        });
      }

      // `text` is a getter in @google/genai (not a method) and is undefined
      // when the model returns no text part (e.g. safety block, thought-only).
      const { text } = response;
      if (text === undefined) {
        throw new Error("Gemini returned no text content");
      }
      return text;
    }).then((text) => reportProvider(request, LLMProvider.GEMINI, text));
  }

  /**
   * Generate text via AWS Bedrock using the Converse API (Amazon Nova models).
   * Used for cheap, high-volume summarisation. Credentials come from the AWS
   * default chain; region is pinned in the client. JSON is requested via the
   * prompt (Converse has no responseMimeType), and the summary parser tolerates
   * stray markdown fences.
   */
  private async generateWithBedrock(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    if (!this.bedrockClient) {
      throw new Error("Bedrock client not initialized");
    }
    const modelId =
      request.model ||
      this.configService.get<string>("BEDROCK_MODEL") ||
      DEFAULT_BEDROCK_MODEL;
    this.logger.log(`Generating text using Bedrock model: ${modelId}`);

    return this.retryOperation(async () => {
      const startTime = Date.now();
      const system = this.bedrockPromptCache.systemBlocks(
        request.systemPrompt,
        request.cacheStaticPrefix,
      );
      const command = new ConverseCommand({
        modelId,
        messages: [{ role: "user", content: [{ text: request.prompt }] }],
        ...(system ? { system } : {}),
        inferenceConfig: {
          temperature: request.temperature ?? RATIOS.SEVENTY_PERCENT,
          maxTokens: Math.min(
            request.maxTokens || QUERY_LIMITS.LLM_CONTEXT_WINDOW,
            BEDROCK_MAX_OUTPUT_TOKENS,
          ),
        },
      });

      let response: ConverseCommandOutput;
      try {
        response = await this.bedrockClient!.send(command);
      } catch (error) {
        const warning = this.bedrockPromptCache.noteRejection(error, modelId);
        if (warning) this.logger.warn(warning);
        throw error;
      }
      const durationMs = Date.now() - startTime;

      if (response.usage) {
        const { record, cacheLogLine } = buildBedrockUsageLog({
          request,
          usage: response.usage,
          modelId,
          userId,
          durationMs,
        });
        if (cacheLogLine) this.logger.log(cacheLogLine);
        await this.tokenUsageService.logUsage(record);
      }

      return (
        response.output?.message?.content
          ?.map((block) => ("text" in block ? block.text : ""))
          .join("") || ""
      );
    }).then((text) => reportProvider(request, LLMProvider.BEDROCK, text));
  }

  /** BearlyMail's OpenAI client, for users not on their own AI account. */
  private requireSystemOpenAiClient(): OpenAI {
    if (!this.openaiClient) {
      throw new ServiceUnavailableException(
        `OpenAI is not configured. Set OPENAI_API_KEY on the server, or add your own key in ${OWN_AI_ACCOUNT_SETTINGS_HINT}.`,
      );
    }
    return this.openaiClient;
  }

  /** BearlyMail's Anthropic client, for users not on their own AI account. */
  private requireSystemAnthropicClient(): Anthropic {
    if (!this.anthropicClient) {
      throw new ServiceUnavailableException(
        `Anthropic is not configured. Set ANTHROPIC_API_KEY on the server, or add your own key in ${OWN_AI_ACCOUNT_SETTINGS_HINT}.`,
      );
    }
    return this.anthropicClient;
  }

  /**
   * Run a single OpenAI chat-completions step that may emit tool calls.
   *
   * Unlike {@link generateText}, this returns the raw assistant message so the
   * caller can drive an agentic loop: if `message.tool_calls` is present it
   * executes the tools and calls again with the results; otherwise
   * `message.content` is the final answer. Used by the Ask AI agent.
   *
   * OpenAI is required here (tool-calling support); there is no Gemini fallback.
   */
  private async openAiChatWithTools(
    params: ToolChatParams,
    client: OpenAI,
    apiKeySource: ApiKeySource,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    const model =
      params.model ||
      this.configService.get<string>("OPENAI_ASK_AI_MODEL") ||
      this.configService.get<string>("OPENAI_MODEL") ||
      DEFAULT_OPENAI_MODEL;

    return this.retryOperation(async () => {
      const startTime = Date.now();
      this.logger.debug(
        `OpenAI tool step using model ${model} (${apiKeySource} key)`,
      );

      const completion = await client.chat.completions.create(
        {
          model,
          messages: params.messages,
          temperature: params.temperature ?? RATIOS.THIRTY_PERCENT,
          max_completion_tokens:
            params.maxTokens || QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
          ...(params.tools && params.tools.length > 0
            ? { tools: params.tools, tool_choice: "auto" as const }
            : {}),
        },
        {
          ...(params.timeoutMs ? { timeout: params.timeoutMs } : {}),
          ...(params.signal ? { signal: params.signal } : {}),
        },
      );

      if (completion.usage) {
        await this.tokenUsageService.logUsage({
          userId: params.userId || null,
          operation: params.operation || LLM_OP_UNKNOWN,
          provider: LLMProvider.OPENAI,
          model,
          promptTokens: completion.usage.prompt_tokens || 0,
          completionTokens: completion.usage.completion_tokens || 0,
          totalTokens: completion.usage.total_tokens || 0,
          durationMs: Date.now() - startTime,
        });
      }

      const message = completion.choices[0]?.message;
      if (!message) {
        throw new Error("OpenAI returned no message in tool step");
      }
      return message;
    });
  }

  /**
   * Provider-agnostic tool-calling step: tries OpenAI first, then falls back to
   * Anthropic (which also supports tool use) so a single provider outage doesn't
   * take Ask AI down. Never falls back on an abort/timeout. Returns the result in
   * OpenAI message shape so callers stay provider-agnostic.
   */
  async chatWithTools(
    params: ToolChatParams,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    const keys = await this.findUserKeys(params.userId);
    if (params.userId && usesOwnAiAccount(keys)) {
      return this.chatWithToolsOnOwnAccount(params, keys, params.userId);
    }
    try {
      return await this.openAiChatWithTools(
        params,
        this.requireSystemOpenAiClient(),
        "system",
      );
    } catch (err) {
      if (this.isAbortError(err)) throw err;
      this.logger.warn(
        `OpenAI tool step failed (${(err as Error).message}); trying Anthropic`,
      );
      try {
        return await this.anthropicChatWithTools(
          params,
          this.requireSystemAnthropicClient(),
          "system",
        );
      } catch (fallbackErr) {
        if (this.isAbortError(fallbackErr)) throw fallbackErr;
        // Surface the clearer "not configured" cause if OpenAI raised it.
        throw err instanceof ServiceUnavailableException ? err : fallbackErr;
      }
    }
  }

  /** Ask AI's tool steps on the user's own keys: OpenAI first, then Anthropic. */
  private chatWithToolsOnOwnAccount(
    params: ToolChatParams,
    keys: UserAiKeys,
    userId: string,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    return this.runOnOwnAccount(
      planOwnProviderAttempts(keys, LLMProvider.OPENAI, params.model),
      userId,
      (attempt) =>
        attempt.provider === LLMProvider.ANTHROPIC
          ? this.anthropicChatWithTools(
              params,
              new Anthropic({ apiKey: attempt.apiKey }),
              "user",
            )
          : this.openAiChatWithTools(
              { ...params, model: attempt.model },
              new OpenAI({ apiKey: attempt.apiKey }),
              "user",
            ),
    );
  }

  private isAbortError(error: unknown): boolean {
    const name = (error as { name?: string })?.name ?? "";
    return name === "AbortError" || name === "APIUserAbortError";
  }

  /**
   * Anthropic tool-calling step. Translates the OpenAI-shaped messages/tools to
   * Anthropic's tool_use/tool_result format, calls the model, and maps the reply
   * back to an OpenAI ChatCompletionMessage.
   */
  private async anthropicChatWithTools(
    params: ToolChatParams,
    client: Anthropic,
    apiKeySource: ApiKeySource,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    const model =
      this.configService.get<string>("ANTHROPIC_MODEL") ||
      DEFAULT_ANTHROPIC_MODEL;
    const { system, messages } = toAnthropicMessages(params.messages);
    const tools = toAnthropicTools(params.tools);

    return this.retryOperation(async () => {
      const startTime = Date.now();
      this.logger.debug(
        `Anthropic tool step using model ${model} (${apiKeySource} key)`,
      );

      const createParams: Anthropic.MessageCreateParamsNonStreaming = {
        model,
        max_tokens: params.maxTokens || QUERY_LIMITS.LLM_MAX_TOKENS_MEDIUM,
        messages,
        ...(system ? { system } : {}),
        ...(tools.length > 0 ? { tools } : {}),
      };
      const requestOptions = {
        ...(params.timeoutMs ? { timeout: params.timeoutMs } : {}),
        ...(params.signal ? { signal: params.signal } : {}),
      };

      const response = await client.messages.create(
        createParams,
        requestOptions,
      );

      if (response.usage) {
        await this.tokenUsageService.logUsage({
          userId: params.userId || null,
          operation: params.operation || LLM_OP_UNKNOWN,
          provider: LLMProvider.ANTHROPIC,
          model,
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens:
            response.usage.input_tokens + response.usage.output_tokens,
          durationMs: Date.now() - startTime,
        });
      }

      return fromAnthropicMessage(response);
    });
  }

  /** OpenAI on BearlyMail's key (users not on their own AI account). */
  private generateWithOpenAI(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    return this.generateWithOpenAIClient(
      request,
      this.requireSystemOpenAiClient(),
      "system",
      userId,
    );
  }

  private async generateWithOpenAIClient(
    request: LLMRequest,
    openaiClient: OpenAI,
    apiKeySource: ApiKeySource,
    userId?: string,
  ): Promise<string> {
    const model =
      request.model ||
      this.configService.get<string>("OPENAI_MODEL") ||
      DEFAULT_OPENAI_MODEL;
    const reasoningEffort =
      this.configService.get<string>("OPENAI_REASONING_EFFORT") || "low";
    const isReasoningModel = supportsReasoningEffort(model);
    const capturedClient = openaiClient;

    return this.retryOperation(async () => {
      const startTime = Date.now();
      this.logger.debug(
        `Generating text with OpenAI model: ${model} using ${apiKeySource} API key${request.userId ? ` (userId: ${request.userId})` : ""}`,
      );

      const generation = {
        openaiClient: capturedClient,
        request,
        model,
        userId,
        startTime,
        tokenUsage: this.tokenUsageService,
        logger: this.logger,
      };
      return isReasoningModel
        ? generateWithOpenAIReasoningModel({ ...generation, reasoningEffort })
        : generateWithOpenAIStandardModel(generation);
    }).then((text) => reportProvider(request, LLMProvider.OPENAI, text));
  }

  /** Anthropic on BearlyMail's key (users not on their own AI account). */
  private generateWithAnthropic(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    return this.generateWithAnthropicClient(
      request,
      this.requireSystemAnthropicClient(),
      "system",
      userId,
    );
  }

  private async generateWithAnthropicClient(
    request: LLMRequest,
    client: Anthropic,
    apiKeySource: ApiKeySource,
    userId?: string,
  ): Promise<string> {
    const model =
      request.model ||
      this.configService.get<string>("ANTHROPIC_MODEL") ||
      DEFAULT_ANTHROPIC_MODEL;

    return this.retryOperation(async () => {
      const startTime = Date.now();
      this.logger.debug(
        `Generating text with Anthropic model: ${model} using ${apiKeySource} API key`,
      );

      const params: Anthropic.MessageCreateParamsNonStreaming = {
        model,
        max_tokens: request.maxTokens ?? QUERY_LIMITS.LLM_MAX_TOKENS_SMALL,
        messages: [{ role: "user", content: request.prompt }],
      };

      if (request.systemPrompt) {
        params.system = request.systemPrompt;
      }

      // Anthropic has no native JSON mode flag; instruct via system prompt.
      // params.system may be string | TextBlockParam[] — normalise to string for the check.
      const currentSystem =
        typeof params.system === "string" ? params.system : "";
      if (request.jsonMode && !currentSystem.includes("JSON")) {
        params.system = `${
          currentSystem
        }\nRespond with valid JSON only. No markdown fences, no commentary.`;
      }

      const response = await client.messages.create(params);

      const durationMs = Date.now() - startTime;

      if (response.usage) {
        await this.tokenUsageService.logUsage({
          userId: userId ?? null,
          operation: request.operation || LLM_OP_UNKNOWN,
          provider: LLMProvider.ANTHROPIC,
          model,
          promptTokens: response.usage.input_tokens,
          completionTokens: response.usage.output_tokens,
          totalTokens:
            response.usage.input_tokens + response.usage.output_tokens,
          durationMs,
          promptText: request.prompt,
          systemPromptText: request.systemPrompt,
          emailIds: request.metadata?.emailIds,
        });
      }

      const block = response.content[0];
      if (!block || block.type !== LLM_BLOCK_TYPES.TEXT) {
        throw new Error("Anthropic returned an unexpected content block type");
      }
      return block.text;
    }).then((text) => reportProvider(request, LLMProvider.ANTHROPIC, text));
  }

  /**
   * Generate text by shelling out to the locally installed Claude Code CLI
   * (`claude -p`) via {@link ClaudeCliClient}, which owns the spawn, JSON
   * parsing, and token-usage logging. The CLI brings its own auth, so no API
   * key is wired in — the child just inherits the process env.
   */
  private async generateWithClaudeCli(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    return this.retryOperation(() => this.claudeCli.generate(request, userId));
  }

  getAvailableProviders(): LLMProvider[] {
    const providers: LLMProvider[] = [];
    if (this.geminiClient) providers.push(LLMProvider.GEMINI);
    if (this.openaiClient) providers.push(LLMProvider.OPENAI);
    if (this.anthropicClient) providers.push(LLMProvider.ANTHROPIC);
    if (this.claudeCli.isAvailable()) providers.push(LLMProvider.CLAUDE_CLI);
    return providers;
  }

  getDefaultProvider(): LLMProvider {
    return this.defaultProvider;
  }
}
