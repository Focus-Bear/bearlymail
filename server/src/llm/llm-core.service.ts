import { Injectable, Logger, Inject, forwardRef } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import OpenAI from "openai";
import { UsersService } from "../users/users.service";
import { LLMProvider, LLMRequest } from "./llm.types";
import { TokenUsageService } from "./token-usage.service";
import { LLM_OP_UNKNOWN } from "./llm-operations";
import { RATIOS } from "../constants/percentages";
import { QUERY_LIMITS } from "../constants/query-limits";
import { MILLISECONDS } from "../constants/time-constants";

@Injectable()
export class LLMCoreService {
  private readonly logger = new Logger(LLMCoreService.name);
  private geminiClient: GoogleGenerativeAI | null = null;
  private openaiClient: OpenAI | null = null;
  private defaultProvider: LLMProvider;

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => UsersService))
    private usersService: UsersService,
    private tokenUsageService: TokenUsageService,
  ) {
    this.initializeClients();
    this.defaultProvider = (
      this.configService.get<string>("LLM_PROVIDER") || "openai"
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
        default:
          throw new Error(`Unsupported LLM provider: ${selectedProvider}`);
      }
    } catch (error) {
      this.logger.error(
        `Error generating text with ${selectedProvider}`,
        error,
      );
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
        this.logger.warn(
          `LLM operation failed, retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`,
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
      this.configService.get<string>("GEMINI_MODEL") || "gemini-1.5-flash";
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
        },
      });

      const durationMs = Date.now() - startTime;
      const { response } = result;

      // Log token usage from Gemini response
      // Cast to any to access usageMetadata which may not be in type definitions
      const usageMetadata = (response as any).usageMetadata;
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
        });
      }

      return response.text();
    });
  }

  private async generateWithOpenAI(
    request: LLMRequest,
    userId?: string,
  ): Promise<string> {
    // Try to get user's API key if userId is provided
    let { openaiClient } = this;
    let apiKeySource = "system";

    if (userId) {
      try {
        const user = await this.usersService.findOneWithApiKey(userId);
        if (user?.openAiApiKey) {
          // User has their own API key - create a client with it
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
      this.configService.get<string>("OPENAI_MODEL") || "gpt-3.5-turbo";

    return this.retryOperation(async () => {
      const startTime = Date.now();
      const messages: Array<{
        role: "system" | "user" | "assistant";
        content: string;
      }> = [];
      if (request.systemPrompt) {
        messages.push({ role: "system", content: request.systemPrompt });
      }
      messages.push({ role: "user", content: request.prompt });

      this.logger.debug(
        `Generating text with OpenAI using ${apiKeySource} API key${request.userId ? ` (userId: ${request.userId})` : ""}`,
      );
      const completion = await openaiClient!.chat.completions.create({
        model,
        messages: messages as any,
        temperature: request.temperature || RATIOS.SEVENTY_PERCENT,
        max_tokens: request.maxTokens || QUERY_LIMITS.LLM_CONTEXT_WINDOW,
      });

      const durationMs = Date.now() - startTime;

      // Log token usage from OpenAI response
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
        });
      }

      return completion.choices[0]?.message?.content || "";
    });
  }

  getAvailableProviders(): LLMProvider[] {
    const providers: LLMProvider[] = [];
    if (this.geminiClient) providers.push(LLMProvider.GEMINI);
    if (this.openaiClient) providers.push(LLMProvider.OPENAI);
    return providers;
  }

  getDefaultProvider(): LLMProvider {
    return this.defaultProvider;
  }
}
