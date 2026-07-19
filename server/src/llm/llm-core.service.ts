import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import {
  BedrockRuntimeClient,
  ConverseCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { GenerationConfig, GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

import { LLM_BLOCK_TYPES } from "../constants/domain-types";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";
import { UsersService } from "../users/users.service";
import {
  fromAnthropicMessage,
  toAnthropicMessages,
  toAnthropicTools,
} from "./anthropic-tool-translation";
import { ClaudeCliClient } from "./claude-cli.helper";
import { LLMProvider, LLMRequest } from "./llm.types";
import { LLM_OP_UNKNOWN, LLMOperation } from "./llm-operations";
import { supportsReasoningEffort } from "./llm-utils";
import { TokenUsageService } from "./token-usage.service";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_TOO_MANY_REQUESTS = 429;

/**
 * Gemini returns 429 for two different conditions: a real per-minute quota
 * exceed (retryable), and prepayment credit depletion (NOT retryable — only
 * a billing top-up fixes it). The message text is the only way to tell them
 * apart from the SDK error.
 */
function isGeminiBillingError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    status === HTTP_TOO_MANY_REQUESTS && /prepayment credits/i.test(message)
  );
}

/**
 * Errors that retries can never fix — short-circuit `retryOperation` so we
 * fall through to the provider fallback on the first failure instead of
 * burning two extra upstream calls per request.
 *  - 401/403: invalid/expired API key.
 *  - UnauthorizedException: the Anthropic path's wrapped form of the above.
 *  - Gemini billing 429: see `isGeminiBillingError`.
 */
function isPermanentLLMError(error: unknown): boolean {
  if (error instanceof UnauthorizedException) return true;
  const status = (error as { status?: number } | null)?.status;
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) return true;
  return isGeminiBillingError(error);
}

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
 * Bedrock defaults. The org SCP denies bedrock:InvokeModel in us-east-1, and
 * Nova is enabled in the account's home region, so we pin ap-southeast-2.
 * Amazon Nova Micro is the cheapest text model — used for summarisation.
 */
const DEFAULT_BEDROCK_REGION = "ap-southeast-2";
const DEFAULT_BEDROCK_MODEL = "amazon.nova-micro-v1:0";
/** Nova Micro caps output at ~5k tokens; clamp so an oversized budget can't 400. */
const BEDROCK_MAX_OUTPUT_TOKENS = 5000;

@Injectable()
export class LLMCoreService {
  private readonly logger = new Logger(LLMCoreService.name);
  private geminiClient: GoogleGenerativeAI | null = null;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private bedrockClient: BedrockRuntimeClient | null = null;
  private defaultProvider: LLMProvider;
  /**
   * Epoch ms after which Gemini calls are allowed again. 0 = circuit closed.
   * Per-process state (web and worker each maintain their own breaker).
   */
  private geminiBillingCircuitOpenUntil = 0;
  /** Local Claude Code CLI wrapper (binary probe + one-shot generations). */
  private readonly claudeCli: ClaudeCliClient;

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private tokenUsageService: TokenUsageService,
  ) {
    this.claudeCli = new ClaudeCliClient(
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

  private initializeClients() {
    // Initialize Gemini
    const geminiApiKey = this.configService.get<string>("GEMINI_API_KEY");
    if (geminiApiKey) {
      try {
        this.geminiClient = new GoogleGenerativeAI(geminiApiKey);
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
      // Do not fall back from Anthropic — auth errors (401/403) surface as
      // UnauthorizedException and should be returned as-is to the caller.
      if (error instanceof UnauthorizedException) {
        throw error;
      }
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

  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
  ): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        // Auth and billing failures are permanent — retrying just multiplies
        // upstream cost. Bail immediately so the outer fallback can take over.
        if (isPermanentLLMError(error)) throw error;
        if (i === maxRetries - 1) throw error;
        const delay =
          Math.pow(2, i) * MILLISECONDS.SECOND +
          Math.random() * MILLISECONDS.SECOND;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `LLM operation failed, retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries}): ${errorMessage}`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Max retries exceeded");
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
      // Pass the static system prompt as Gemini's systemInstruction (a stable,
      // identical-per-call prefix) rather than concatenating it into the user
      // message. This lets Gemini's implicit context caching reuse the prefix
      // across calls (large discount on the cached input tokens) — the OpenAI
      // path already separates system/user the same way.
      const model = this.geminiClient!.getGenerativeModel({
        model: modelName,
        ...(request.systemPrompt
          ? { systemInstruction: request.systemPrompt }
          : {}),
      });

      // `thinkingConfig` is supported by the Gemini REST API but not yet typed
      // in this SDK version, so we build a widened config and cast. A budget of
      // -1 lets the model decide how much to think (dynamic).
      const generationConfig: Record<string, unknown> = {
        temperature: request.temperature || RATIOS.SEVENTY_PERCENT,
        maxOutputTokens: request.maxTokens || QUERY_LIMITS.LLM_CONTEXT_WINDOW,
        ...(request.jsonMode && { responseMimeType: "application/json" }),
        ...(request.thinking && { thinkingConfig: { thinkingBudget: -1 } }),
      };

      let result: Awaited<ReturnType<typeof model.generateContent>>;
      try {
        result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: request.prompt }] }],
          generationConfig: generationConfig as GenerationConfig,
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
      const { response } = result;

      // Log token usage from Gemini response
      // usageMetadata may not be fully typed in older SDK versions
      const { usageMetadata } = response as {
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
          cachedContentTokenCount?: number;
        };
      };
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

      return response.text();
    });
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
      const command = new ConverseCommand({
        modelId,
        messages: [{ role: "user", content: [{ text: request.prompt }] }],
        ...(request.systemPrompt
          ? { system: [{ text: request.systemPrompt }] }
          : {}),
        inferenceConfig: {
          temperature: request.temperature ?? RATIOS.SEVENTY_PERCENT,
          maxTokens: Math.min(
            request.maxTokens || QUERY_LIMITS.LLM_CONTEXT_WINDOW,
            BEDROCK_MAX_OUTPUT_TOKENS,
          ),
        },
      });

      const response = await this.bedrockClient!.send(command);
      const durationMs = Date.now() - startTime;

      if (response.usage) {
        await this.tokenUsageService.logUsage({
          userId: userId || null,
          operation: request.operation || LLM_OP_UNKNOWN,
          provider: LLMProvider.BEDROCK,
          model: modelId,
          promptTokens: response.usage.inputTokens || 0,
          completionTokens: response.usage.outputTokens || 0,
          totalTokens: response.usage.totalTokens || 0,
          durationMs,
          promptText: request.prompt,
          systemPromptText: request.systemPrompt,
          emailIds: request.metadata?.emailIds,
        });
      }

      return (
        response.output?.message?.content
          ?.map((block) => ("text" in block ? block.text : ""))
          .join("") || ""
      );
    });
  }

  private async generateWithOpenAIReasoningModel(options: {
    openaiClient: OpenAI;
    request: LLMRequest;
    model: string;
    reasoningEffort: string;
    userId: string | undefined;
    startTime: number;
  }): Promise<string> {
    const { openaiClient, request, model, reasoningEffort, userId, startTime } =
      options;
    if (
      !openaiClient.responses ||
      typeof openaiClient.responses.create !== "function"
    ) {
      const sdkError = new Error(
        `OpenAI SDK does not support responses.create() - the Responses API requires openai SDK v4.87.0+. ` +
          `Current model ${model} requires this API for reasoning support. ` +
          `Consider upgrading the openai package or switching to a non-reasoning model.`,
      );
      this.logger.error(sdkError.message);
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
      await this.tokenUsageService.logUsage({
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

  private async generateWithOpenAIStandardModel(
    openaiClient: OpenAI,
    request: LLMRequest,
    model: string,
    userId: string | undefined,
    startTime: number,
  ): Promise<string> {
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
      max_completion_tokens:
        request.maxTokens || QUERY_LIMITS.LLM_CONTEXT_WINDOW,
      ...(request.jsonMode && {
        response_format: { type: "json_object" as const },
      }),
    };

    const completion =
      await openaiClient.chat.completions.create(completionParams);
    const durationMs = Date.now() - startTime;

    if (completion.usage) {
      await this.tokenUsageService.logUsage({
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

  /**
   * Resolve the OpenAI client to use for a request: the user's own key takes
   * precedence over the system key. Shared by plain-text generation and the
   * tool-calling path so both honour a user-supplied key.
   */
  private async resolveOpenAiClient(
    userId?: string,
  ): Promise<{ client: OpenAI; apiKeySource: "system" | "user" }> {
    let client = this.openaiClient;
    let apiKeySource: "system" | "user" = "system";

    if (userId) {
      try {
        const user = await this.usersService.findOneWithApiKey(userId);
        if (user?.openAiApiKey) {
          client = new OpenAI({ apiKey: user.openAiApiKey });
          apiKeySource = "user";
          this.logger.debug(`Using user's OpenAI API key for user ${userId}`);
        }
      } catch (error) {
        this.logger.warn(
          `Failed to fetch user's API key for ${userId}, using system key`,
          error,
        );
      }
    }

    if (!client) {
      throw new ServiceUnavailableException(
        "OpenAI is not configured. Set OPENAI_API_KEY on the server, or add your own OpenAI key in Settings → Integrations.",
      );
    }
    return { client, apiKeySource };
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
  async openAiChatWithTools(
    params: ToolChatParams,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    const { client, apiKeySource } = await this.resolveOpenAiClient(
      params.userId,
    );
    const model =
      params.model ||
      this.configService.get<string>("OPENAI_ASK_AI_MODEL") ||
      this.configService.get<string>("OPENAI_MODEL") ||
      "gpt-5.4-mini";

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
    try {
      return await this.openAiChatWithTools(params);
    } catch (err) {
      if (this.isAbortError(err)) throw err;
      this.logger.warn(
        `OpenAI tool step failed (${(err as Error).message}); trying Anthropic`,
      );
      try {
        return await this.anthropicChatWithTools(params);
      } catch (fallbackErr) {
        if (this.isAbortError(fallbackErr)) throw fallbackErr;
        // Surface the clearer "not configured" cause if OpenAI raised it.
        throw err instanceof ServiceUnavailableException ? err : fallbackErr;
      }
    }
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
  async anthropicChatWithTools(
    params: ToolChatParams,
  ): Promise<OpenAI.Chat.Completions.ChatCompletionMessage> {
    const { client, apiKeySource } = await this.resolveAnthropicClient(
      params.userId,
    );
    const model =
      this.configService.get<string>("ANTHROPIC_MODEL") || "claude-sonnet-4-6";
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

      let response: Anthropic.Message;
      try {
        response = await client.messages.create(createParams, requestOptions);
      } catch (err: unknown) {
        const { status } = err as { status?: number };
        if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
          throw new UnauthorizedException(
            "Your Anthropic API key is invalid or has expired. Please update it in Settings → Integrations.",
          );
        }
        throw err;
      }

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

  /** Resolve the Anthropic client (user key takes precedence over system key). */
  private async resolveAnthropicClient(
    userId?: string,
  ): Promise<{ client: Anthropic; apiKeySource: "system" | "user" }> {
    let client = this.anthropicClient;
    let apiKeySource: "system" | "user" = "system";

    if (userId) {
      try {
        const user = await this.usersService.findOneWithAnthropicKey(userId);
        if (user?.anthropicApiKey) {
          client = new Anthropic({ apiKey: user.anthropicApiKey });
          apiKeySource = "user";
        }
      } catch (err) {
        this.logger.warn(
          `Failed to fetch Anthropic key for userId=${userId}, using system key`,
          err,
        );
      }
    }

    if (!client) {
      throw new ServiceUnavailableException(
        "Anthropic is not configured. Set ANTHROPIC_API_KEY on the server, or add your own key in Settings → Integrations.",
      );
    }
    return { client, apiKeySource };
  }

  private async generateWithOpenAI(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    const { client: openaiClient, apiKeySource } =
      await this.resolveOpenAiClient(userId);

    const model =
      request.model ||
      this.configService.get<string>("OPENAI_MODEL") ||
      "gpt-5.4-mini";
    const reasoningEffort =
      this.configService.get<string>("OPENAI_REASONING_EFFORT") || "low";
    const isReasoningModel = supportsReasoningEffort(model);
    const capturedClient = openaiClient;

    return this.retryOperation(async () => {
      const startTime = Date.now();
      this.logger.debug(
        `Generating text with OpenAI model: ${model} using ${apiKeySource} API key${request.userId ? ` (userId: ${request.userId})` : ""}`,
      );

      if (isReasoningModel) {
        return this.generateWithOpenAIReasoningModel({
          openaiClient: capturedClient,
          request,
          model,
          reasoningEffort,
          userId,
          startTime,
        });
      }
      return this.generateWithOpenAIStandardModel(
        capturedClient,
        request,
        model,
        userId,
        startTime,
      );
    });
  }

  private async generateWithAnthropic(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    let client = this.anthropicClient;
    let apiKeySource = "system";

    // User key overrides the system key
    if (userId) {
      try {
        const user = await this.usersService.findOneWithAnthropicKey(userId);
        if (user?.anthropicApiKey) {
          client = new Anthropic({ apiKey: user.anthropicApiKey });
          apiKeySource = "user";
          this.logger.debug(`Using user Anthropic key for userId=${userId}`);
        }
      } catch (err) {
        this.logger.warn(
          `Failed to fetch Anthropic key for userId=${userId}, using system key`,
          err,
        );
      }
    }

    if (!client) {
      throw new Error(
        "No Anthropic client available (no system key and no user key set)",
      );
    }

    const model =
      this.configService.get<string>("ANTHROPIC_MODEL") || "claude-sonnet-4-6";

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

      let response: Anthropic.Message;
      try {
        response = await client!.messages.create(params);
      } catch (err: unknown) {
        const { status } = err as { status?: number };
        if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
          throw new UnauthorizedException(
            "Your Anthropic API key is invalid or has expired. Please update it in Settings → Integrations.",
          );
        }
        throw err;
      }

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
    });
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
