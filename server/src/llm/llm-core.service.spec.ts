import { Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { UsersService } from "../users/users.service";
import { LLMProvider, LLMRequest } from "./llm.types";
import { LLMCoreService } from "./llm-core.service";
import { TokenUsageService } from "./token-usage.service";

// --- Vendor SDK mocks ---
// Names are prefixed `mock*` so they survive jest.mock hoisting.

const mockGeminiGenerateContent = jest.fn();
const mockGeminiGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGeminiGenerateContent,
}));

const mockOpenAIChatCreate = jest.fn();
const mockOpenAIResponsesCreate = jest.fn();

const mockAnthropicMessagesCreate = jest.fn();
const mockBedrockSend = jest.fn();

jest.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: jest.fn().mockImplementation(() => ({
    send: mockBedrockSend,
  })),
  ConverseCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGeminiGetGenerativeModel,
  })),
}));

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAIChatCreate } },
    responses: { create: mockOpenAIResponsesCreate },
  })),
}));

jest.mock("@anthropic-ai/sdk", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    messages: { create: mockAnthropicMessagesCreate },
  })),
}));

// --- Test helpers ---

const allKeysConfig: Record<string, string | undefined> = {
  GEMINI_API_KEY: "gemini-key",
  OPENAI_API_KEY: "openai-key",
  ANTHROPIC_API_KEY: "anthropic-key",
};

function makeService(
  config: Record<string, string | undefined> = allKeysConfig,
) {
  const configService = {
    get: jest.fn((key: string) => config[key]),
  } as unknown as ConfigService;

  const usersService = {
    findOneWithApiKey: jest.fn().mockResolvedValue(null),
    findOneWithAnthropicKey: jest.fn().mockResolvedValue(null),
  } as unknown as UsersService;

  const tokenUsageService = {
    logUsage: jest.fn().mockResolvedValue(undefined),
  } as unknown as TokenUsageService;

  const service = new LLMCoreService(
    configService,
    usersService,
    tokenUsageService,
  );
  return { service, tokenUsageService, usersService };
}

const baseRequest: LLMRequest = { prompt: "Hello" };

describe("LLMCoreService", () => {
  beforeAll(() => {
    // Make retry backoff instantaneous so the suite stays fast.
    jest.spyOn(global, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout);
  });

  afterAll(() => {
    jest.restoreAllMocks();
  });

  beforeEach(() => {
    mockGeminiGenerateContent.mockReset();
    mockOpenAIChatCreate.mockReset();
    mockOpenAIResponsesCreate.mockReset();
    mockAnthropicMessagesCreate.mockReset();
    mockBedrockSend.mockReset();
  });

  describe("Bedrock provider", () => {
    it("returns Nova text and records the actual provider and model", async () => {
      mockBedrockSend.mockResolvedValue({
        output: { message: { content: [{ text: "nova-result" }] } },
        usage: { inputTokens: 40, outputTokens: 8, totalTokens: 48 },
      });
      const { service, tokenUsageService } = makeService();

      const result = await service.generateText(
        baseRequest,
        LLMProvider.BEDROCK,
      );

      expect(result).toBe("nova-result");
      expect(tokenUsageService.logUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: LLMProvider.BEDROCK,
          model: "amazon.nova-micro-v1:0",
          promptTokens: 40,
          completionTokens: 8,
          totalTokens: 48,
        }),
      );
    });
  });

  describe("Gemini provider", () => {
    it("maps Gemini usageMetadata to token-usage tracking fields", async () => {
      mockGeminiGenerateContent.mockResolvedValue({
        response: {
          text: () => "gemini-result",
          usageMetadata: {
            promptTokenCount: 30,
            candidatesTokenCount: 7,
            totalTokenCount: 37,
          },
        },
      });
      const { service, tokenUsageService } = makeService();

      const out = await service.generateText(baseRequest, LLMProvider.GEMINI);

      expect(out).toBe("gemini-result");
      expect(tokenUsageService.logUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: LLMProvider.GEMINI,
          promptTokens: 30,
          completionTokens: 7,
          totalTokens: 37,
        }),
      );
    });

    it("requests JSON output by setting responseMimeType when jsonMode is true", async () => {
      mockGeminiGenerateContent.mockResolvedValue({
        response: { text: () => "{}", usageMetadata: undefined },
      });
      const { service } = makeService();

      await service.generateText(
        { prompt: "p", jsonMode: true },
        LLMProvider.GEMINI,
      );

      expect(mockGeminiGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          generationConfig: expect.objectContaining({
            responseMimeType: "application/json",
          }),
        }),
      );
    });

    it("passes systemPrompt as systemInstruction and keeps it out of the user message", async () => {
      mockGeminiGetGenerativeModel.mockClear();
      mockGeminiGenerateContent.mockResolvedValue({
        response: { text: () => "ok", usageMetadata: undefined },
      });
      const { service } = makeService();

      await service.generateText(
        { prompt: "BODY", systemPrompt: "STATIC RULES" },
        LLMProvider.GEMINI,
      );

      // Static block becomes a cacheable systemInstruction...
      expect(mockGeminiGetGenerativeModel).toHaveBeenCalledWith(
        expect.objectContaining({ systemInstruction: "STATIC RULES" }),
      );
      // ...and the user message is ONLY the dynamic body (no concatenation).
      expect(mockGeminiGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [{ role: "user", parts: [{ text: "BODY" }] }],
        }),
      );
    });

    it("omits systemInstruction when there is no system prompt", async () => {
      mockGeminiGetGenerativeModel.mockClear();
      mockGeminiGenerateContent.mockResolvedValue({
        response: { text: () => "ok", usageMetadata: undefined },
      });
      const { service } = makeService();

      await service.generateText({ prompt: "p" }, LLMProvider.GEMINI);

      expect(mockGeminiGetGenerativeModel.mock.calls[0][0]).not.toHaveProperty(
        "systemInstruction",
      );
      expect(mockGeminiGenerateContent).toHaveBeenCalledWith(
        expect.objectContaining({
          contents: [{ role: "user", parts: [{ text: "p" }] }],
        }),
      );
    });
  });

  describe("OpenAI provider", () => {
    it("uses the chat completions endpoint for non-reasoning models and maps usage", async () => {
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: "openai-result" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
      const { service, tokenUsageService } = makeService({
        ...allKeysConfig,
        OPENAI_MODEL: "gpt-4o-mini",
      });

      const out = await service.generateText(baseRequest, LLMProvider.OPENAI);

      expect(out).toBe("openai-result");
      expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(1);
      expect(mockOpenAIResponsesCreate).not.toHaveBeenCalled();
      expect(tokenUsageService.logUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: LLMProvider.OPENAI,
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
        }),
      );
    });

    it("requests JSON output via response_format on the chat completions endpoint", async () => {
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: "{}" } }],
        usage: undefined,
      });
      const { service } = makeService({
        ...allKeysConfig,
        OPENAI_MODEL: "gpt-4o-mini",
      });

      await service.generateText(
        { prompt: "p", jsonMode: true },
        LLMProvider.OPENAI,
      );

      expect(mockOpenAIChatCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          response_format: { type: "json_object" },
        }),
      );
    });

    it("uses the Responses API for reasoning-capable models", async () => {
      mockOpenAIResponsesCreate.mockResolvedValue({
        output_text: "reasoning-result",
        usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
      });
      const { service } = makeService({
        ...allKeysConfig,
        OPENAI_MODEL: "gpt-5.4-mini",
      });

      const out = await service.generateText(baseRequest, LLMProvider.OPENAI);

      expect(out).toBe("reasoning-result");
      expect(mockOpenAIResponsesCreate).toHaveBeenCalledTimes(1);
      expect(mockOpenAIChatCreate).not.toHaveBeenCalled();
      expect(mockOpenAIResponsesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          reasoning: expect.any(Object),
        }),
      );
    });
  });

  describe("Anthropic provider", () => {
    it("returns the first text block and sums input+output tokens for total usage", async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: "text", text: "anthropic-result" }],
        usage: { input_tokens: 20, output_tokens: 6 },
      });
      const { service, tokenUsageService } = makeService();

      const out = await service.generateText(
        baseRequest,
        LLMProvider.ANTHROPIC,
      );

      expect(out).toBe("anthropic-result");
      expect(tokenUsageService.logUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: LLMProvider.ANTHROPIC,
          promptTokens: 20,
          completionTokens: 6,
          totalTokens: 26,
        }),
      );
    });

    it("appends a JSON directive to the system prompt when jsonMode is set and it is missing", async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: "text", text: "{}" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
      const { service } = makeService();

      await service.generateText(
        { prompt: "p", systemPrompt: "Base instructions", jsonMode: true },
        LLMProvider.ANTHROPIC,
      );

      expect(mockAnthropicMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining("Base instructions"),
        }),
      );
      expect(mockAnthropicMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: expect.stringContaining("Respond with valid JSON only"),
        }),
      );
    });

    it("does not duplicate the JSON directive when the system prompt already mentions JSON", async () => {
      mockAnthropicMessagesCreate.mockResolvedValue({
        content: [{ type: "text", text: "{}" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
      const { service } = makeService();

      await service.generateText(
        { prompt: "p", systemPrompt: "Return a JSON object.", jsonMode: true },
        LLMProvider.ANTHROPIC,
      );

      expect(mockAnthropicMessagesCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          system: "Return a JSON object.",
        }),
      );
    });

    it("surfaces 401 as UnauthorizedException without falling back to another provider", async () => {
      const authError = Object.assign(new Error("unauthorized"), {
        status: 401,
      });
      mockAnthropicMessagesCreate.mockRejectedValue(authError);
      const { service } = makeService();

      await expect(
        service.generateText(baseRequest, LLMProvider.ANTHROPIC),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      // 401 is permanent — retrying can never fix it, so the upstream call
      // fires exactly once before bubbling up.
      expect(mockAnthropicMessagesCreate).toHaveBeenCalledTimes(1);
      expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
      expect(mockOpenAIChatCreate).not.toHaveBeenCalled();
    });
  });

  describe("provider fallback", () => {
    it("falls back from Gemini to OpenAI when Gemini fails", async () => {
      mockGeminiGenerateContent.mockRejectedValue(new Error("gemini-down"));
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: "from-openai" } }],
        usage: undefined,
      });
      const { service } = makeService({
        ...allKeysConfig,
        OPENAI_MODEL: "gpt-4o-mini",
      });

      const out = await service.generateText(baseRequest, LLMProvider.GEMINI);

      expect(out).toBe("from-openai");
      // 3 Gemini retries then a single successful OpenAI call.
      expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(3);
      expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(1);
    });

    it("falls back from OpenAI to Gemini when OpenAI fails", async () => {
      mockOpenAIChatCreate.mockRejectedValue(new Error("openai-down"));
      mockGeminiGenerateContent.mockResolvedValue({
        response: { text: () => "from-gemini", usageMetadata: undefined },
      });
      const { service } = makeService({
        ...allKeysConfig,
        OPENAI_MODEL: "gpt-4o-mini",
      });

      const out = await service.generateText(baseRequest, LLMProvider.OPENAI);

      expect(out).toBe("from-gemini");
      expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(3);
      expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(1);
    });
  });

  describe("Gemini billing 429 handling", () => {
    function billingError() {
      return Object.assign(
        new Error(
          "[GoogleGenerativeAI Error]: Error fetching from https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent: [429 Too Many Requests] Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.",
        ),
        { status: 429 },
      );
    }

    it("skips retries on a Gemini billing 429 and falls back to OpenAI immediately", async () => {
      mockGeminiGenerateContent.mockRejectedValue(billingError());
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: "from-openai" } }],
        usage: undefined,
      });
      const { service } = makeService({
        ...allKeysConfig,
        OPENAI_MODEL: "gpt-4o-mini",
      });

      const out = await service.generateText(baseRequest, LLMProvider.GEMINI);

      expect(out).toBe("from-openai");
      // No retry storm: one Gemini call, one OpenAI fallback. Previously this
      // would have been 3 Gemini calls before falling back.
      expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(1);
    });

    it("opens the circuit breaker after a billing 429 so subsequent calls skip Gemini entirely", async () => {
      mockGeminiGenerateContent.mockRejectedValueOnce(billingError());
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: "from-openai" } }],
        usage: undefined,
      });
      const warnSpy = jest
        .spyOn(Logger.prototype, "warn")
        .mockImplementation(() => undefined);
      const errorSpy = jest
        .spyOn(Logger.prototype, "error")
        .mockImplementation(() => undefined);
      const { service } = makeService({
        ...allKeysConfig,
        OPENAI_MODEL: "gpt-4o-mini",
      });

      await service.generateText(baseRequest, LLMProvider.GEMINI);
      await service.generateText(baseRequest, LLMProvider.GEMINI);
      await service.generateText(baseRequest, LLMProvider.GEMINI);

      // First call hits Gemini once (billing 429), the next two short-circuit
      // before ever touching the SDK — all three resolve via OpenAI.
      expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(1);
      expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(3);

      // Only one "opening circuit" WARN across all three calls — concurrent
      // callers must not each log the trip event.
      const openingWarns = warnSpy.mock.calls.filter(([msg]) =>
        typeof msg === "string" ? msg.includes("opening circuit") : false,
      );
      expect(openingWarns).toHaveLength(1);

      // Bypass calls (after the trip) must NOT emit ERROR logs — the whole
      // point of bypassing instead of throwing is to keep logs clean during
      // a billing outage. The first call's outer "Error generating text with
      // gemini" log is expected; calls 2 and 3 must not add to it.
      const geminiErrorLogs = errorSpy.mock.calls.filter(([msg]) =>
        typeof msg === "string"
          ? msg.includes("Error generating text with gemini")
          : false,
      );
      expect(geminiErrorLogs).toHaveLength(1);

      warnSpy.mockRestore();
      errorSpy.mockRestore();
    });

    it("closes the circuit breaker after the cooldown window elapses", async () => {
      const FIVE_MINUTES_MS = 5 * 60 * 1000;
      const t0 = 1_000_000_000;
      const dateSpy = jest.spyOn(Date, "now").mockReturnValue(t0);
      mockGeminiGenerateContent
        .mockRejectedValueOnce(billingError())
        .mockResolvedValueOnce({
          response: {
            text: () => "from-gemini-again",
            usageMetadata: undefined,
          },
        });
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: "from-openai" } }],
        usage: undefined,
      });
      const { service } = makeService({
        ...allKeysConfig,
        OPENAI_MODEL: "gpt-4o-mini",
      });

      // First call trips the breaker at t0; fallback to OpenAI.
      await service.generateText(baseRequest, LLMProvider.GEMINI);
      expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(1);

      // Advance past the cooldown window; Gemini should be tried again.
      dateSpy.mockReturnValue(t0 + FIVE_MINUTES_MS + 1);
      const out = await service.generateText(baseRequest, LLMProvider.GEMINI);

      expect(out).toBe("from-gemini-again");
      expect(mockGeminiGenerateContent).toHaveBeenCalledTimes(2);

      dateSpy.mockRestore();
    });
  });

  describe("getAvailableProviders", () => {
    it("includes only providers whose API key was configured", () => {
      const { service } = makeService({
        GEMINI_API_KEY: "g",
        OPENAI_API_KEY: "o",
        // ANTHROPIC_API_KEY intentionally omitted
      });
      expect(service.getAvailableProviders()).toEqual([
        LLMProvider.GEMINI,
        LLMProvider.OPENAI,
      ]);
    });
  });
});
