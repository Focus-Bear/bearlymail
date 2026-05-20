import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";

import { LLM_BLOCK_TYPES } from "../constants/domain-types";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";
import { UsersService } from "../users/users.service";
import { LLMProvider, LLMRequest } from "./llm.types";
import { LLM_OP_UNKNOWN } from "./llm-operations";
import { supportsReasoningEffort } from "./llm-utils";
import { TokenUsageService } from "./token-usage.service";

const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;

@Injectable()
export class LLMCoreService {
  private readonly logger = new Logger(LLMCoreService.name);
  private geminiClient: GoogleGenerativeAI | null = null;
  private openaiClient: OpenAI | null = null;
  private anthropicClient: Anthropic | null = null;
  private defaultProvider: LLMProvider;

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private tokenUsageService: TokenUsageService,
  ) {
    this.initializeClients();
    this.defaultProvider = (
      this.configService.get<string>("LLM_PROVIDER") || "gemini"
    ).toLowerCase() as LLMProvider;
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
      // Fallback to the other provider if available
      if (selectedProvider === LLMProvider.GEMINI) {
        this.logger.log(
          `Gemini failed, falling back to OpenAI (default provider)`,
        );
        return await this.generateWithOpenAI(request, effectiveUserId);
      } else if (selectedProvider === LLMProvider.OPENAI) {
        this.logger.log(`OpenAI failed, falling back to Gemini`);
        return await this.generateWithGemini(request, effectiveUserId);
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

  private async generateWithGemini(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    // Note: Gemini doesn't support user-specific API keys, always uses system key
    if (!this.geminiClient) {
      throw new Error("Gemini client not initialized");
    }

    const modelName =
      this.configService.get<string>("GEMINI_MODEL") || "gemini-3.1-flash-lite";
    this.logger.log(`Generating text using Gemini model: ${modelName}`);

    return this.retryOperation(async () => {
      const startTime = Date.now();
      const model = this.geminiClient!.getGenerativeModel({
        model: modelName,
      });

      const fullPrompt = request.systemPrompt
        ? `${request.systemPrompt}\n\n${request.prompt}`
        : request.prompt;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: fullPrompt }] }],
        generationConfig: {
          temperature: request.temperature || RATIOS.SEVENTY_PERCENT,
          maxOutputTokens: request.maxTokens || QUERY_LIMITS.LLM_CONTEXT_WINDOW,
          ...(request.jsonMode && { responseMimeType: "application/json" }),
        },
      });

      const durationMs = Date.now() - startTime;
      const { response } = result;

      // Log token usage from Gemini response
      // usageMetadata may not be fully typed in older SDK versions
      const { usageMetadata } = response as {
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };
      if (usageMetadata) {
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

  private async generateWithOpenAI(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    let { openaiClient } = this;
    let apiKeySource = "system";

    if (userId) {
      try {
        const user = await this.usersService.findOneWithApiKey(userId);
        if (user?.openAiApiKey) {
          openaiClient = new OpenAI({ apiKey: user.openAiApiKey });
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

    if (!openaiClient) {
      throw new Error("OpenAI client not initialized");
    }

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

  getAvailableProviders(): LLMProvider[] {
    const providers: LLMProvider[] = [];
    if (this.geminiClient) providers.push(LLMProvider.GEMINI);
    if (this.openaiClient) providers.push(LLMProvider.OPENAI);
    if (this.anthropicClient) providers.push(LLMProvider.ANTHROPIC);
    return providers;
  }

  getDefaultProvider(): LLMProvider {
    return this.defaultProvider;
  }
}
