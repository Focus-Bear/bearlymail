import { Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { EventEmitter } from "events";

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

const mockSpawn = jest.fn();
const mockSpawnSync = jest.fn();

jest.mock("child_process", () => ({
  ...jest.requireActual("child_process"),
  spawn: (...args: unknown[]) => mockSpawn(...args),
  spawnSync: (...args: unknown[]) => mockSpawnSync(...args),
}));

jest.mock("@aws-sdk/client-bedrock-runtime", () => ({
  BedrockRuntimeClient: jest
    .fn()
    .mockImplementation(() => ({ send: mockBedrockSend })),
  ConverseCommand: jest.fn().mockImplementation((input) => ({ input })),
}));

/** The mocked ConverseCommand ctor, for inspecting the Converse input. */
const bedrockConverseCommand = (
  jest.requireMock("@aws-sdk/client-bedrock-runtime") as {
    ConverseCommand: jest.Mock;
  }
).ConverseCommand;

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

/**
 * Builds a fake `claude -p` child process. Emitting is driven by the service
 * calling `stdin.end(prompt)`: the fake then replays the configured stdout/
 * stderr and fires `close` with the configured exit code/signal — mirroring
 * how the real CLI reads the whole prompt from stdin before answering.
 */
function makeFakeCliChild(options: {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  signal?: NodeJS.Signals | null;
}) {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { on: jest.Mock; end: jest.Mock };
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    on: jest.fn(),
    end: jest.fn(() => {
      if (options.stdout) {
        child.stdout.emit("data", Buffer.from(options.stdout));
      }
      if (options.stderr) {
        child.stderr.emit("data", Buffer.from(options.stderr));
      }
      child.emit("close", options.exitCode ?? 0, options.signal ?? null);
    }),
  };
  return child;
}

/** Availability probe result meaning "claude --version exited 0". */
const cliAvailableProbe = { status: 0 };

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
    bedrockConverseCommand.mockClear();
    mockSpawn.mockReset();
    // Default: the claude binary is NOT installed (ENOENT), matching CI.
    mockSpawnSync
      .mockReset()
      .mockReturnValue({ status: null, error: new Error("spawnSync ENOENT") });
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

  describe("Bedrock provider (Amazon Nova)", () => {
    it("returns Converse text and maps usage to token tracking with the Nova model", async () => {
      mockBedrockSend.mockResolvedValue({
        output: { message: { content: [{ text: "nova-result" }] } },
        usage: { inputTokens: 40, outputTokens: 8, totalTokens: 48 },
      });
      const { service, tokenUsageService } = makeService();

      const out = await service.generateText(baseRequest, LLMProvider.BEDROCK);

      expect(out).toBe("nova-result");
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

    it("clamps maxTokens to Nova's output ceiling", async () => {
      mockBedrockSend.mockResolvedValue({
        output: { message: { content: [{ text: "ok" }] } },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      });
      const { service } = makeService();

      await service.generateText(
        { prompt: "p", maxTokens: 100000 },
        LLMProvider.BEDROCK,
      );

      const input = bedrockConverseCommand.mock.calls.at(-1)?.[0];
      expect(input.modelId).toBe("amazon.nova-micro-v1:0");
      expect(input.inferenceConfig.maxTokens).toBeLessThanOrEqual(5000);
    });

    it("falls back to Gemini when Bedrock fails", async () => {
      mockBedrockSend.mockRejectedValue(new Error("bedrock unavailable"));
      mockGeminiGenerateContent.mockResolvedValue({
        response: { text: () => "gemini-fallback", usageMetadata: undefined },
      });
      const { service } = makeService();

      const out = await service.generateText(baseRequest, LLMProvider.BEDROCK);

      expect(out).toBe("gemini-fallback");
    });

    it("falls back to OpenAI when Bedrock fails and Gemini is not configured (OpenAI-only install)", async () => {
      mockBedrockSend.mockRejectedValue(new Error("bedrock unavailable"));
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: "openai-fallback" } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      });
      const { service } = makeService({
        OPENAI_API_KEY: "openai-key",
        OPENAI_MODEL: "gpt-4o-mini",
      });

      const out = await service.generateText(baseRequest, LLMProvider.BEDROCK);

      expect(out).toBe("openai-fallback");
      expect(mockGeminiGenerateContent).not.toHaveBeenCalled();
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

  describe("Claude CLI provider", () => {
    it("returns the CLI result and logs usage with summed prompt tokens", async () => {
      mockSpawnSync.mockReturnValue(cliAvailableProbe);
      const envelope = JSON.stringify({
        type: "result",
        is_error: false,
        result: "cli-result",
        duration_ms: 1234,
        usage: {
          input_tokens: 100,
          output_tokens: 20,
          cache_creation_input_tokens: 30,
          cache_read_input_tokens: 70,
        },
      });
      const child = makeFakeCliChild({ stdout: envelope });
      mockSpawn.mockReturnValue(child);
      const { service, tokenUsageService } = makeService();

      const out = await service.generateText(
        baseRequest,
        LLMProvider.CLAUDE_CLI,
      );

      expect(out).toBe("cli-result");
      expect(tokenUsageService.logUsage).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: LLMProvider.CLAUDE_CLI,
          model: "sonnet",
          // promptTokens = input + cache_creation + cache_read
          promptTokens: 200,
          completionTokens: 20,
          totalTokens: 220,
        }),
      );
      // Non-interactive JSON call with tools disabled; the prompt travels via
      // stdin (never argv, which would hit ARG_MAX on large emails).
      const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]];
      expect(cmd).toBe("claude");
      expect(args).toEqual(
        expect.arrayContaining([
          "-p",
          "--output-format",
          "json",
          "--model",
          "sonnet",
          "--tools",
          "",
          "--no-session-persistence",
        ]),
      );
      expect(args).not.toContain("Hello");
      expect(child.stdin.end).toHaveBeenCalledWith("Hello");
    });

    it("appends the JSON directive to --system-prompt and strips markdown fences in jsonMode", async () => {
      mockSpawnSync.mockReturnValue(cliAvailableProbe);
      const envelope = JSON.stringify({
        is_error: false,
        result: '```json\n{"a": 1}\n```',
      });
      mockSpawn.mockReturnValue(makeFakeCliChild({ stdout: envelope }));
      const { service } = makeService();

      const out = await service.generateText(
        { prompt: "p", systemPrompt: "Base instructions", jsonMode: true },
        LLMProvider.CLAUDE_CLI,
      );

      expect(out).toBe('{"a": 1}');
      const [, args] = mockSpawn.mock.calls[0] as [string, string[]];
      const systemPrompt = args[args.indexOf("--system-prompt") + 1];
      expect(systemPrompt).toContain("Base instructions");
      expect(systemPrompt).toContain("Respond with valid JSON only");
    });

    it("falls back to OpenAI when the CLI reports is_error", async () => {
      mockSpawnSync.mockReturnValue(cliAvailableProbe);
      const envelope = JSON.stringify({
        is_error: true,
        result: "usage limit reached",
      });
      mockSpawn.mockImplementation(() =>
        makeFakeCliChild({ stdout: envelope }),
      );
      mockOpenAIChatCreate.mockResolvedValue({
        choices: [{ message: { content: "from-openai" } }],
        usage: undefined,
      });
      const { service } = makeService({
        ...allKeysConfig,
        OPENAI_MODEL: "gpt-4o-mini",
      });

      const out = await service.generateText(
        baseRequest,
        LLMProvider.CLAUDE_CLI,
      );

      expect(out).toBe("from-openai");
      // 3 CLI retries then a single successful OpenAI call.
      expect(mockSpawn).toHaveBeenCalledTimes(3);
      expect(mockOpenAIChatCreate).toHaveBeenCalledTimes(1);
    });

    it("throws on a non-zero exit code including the stderr snippet", async () => {
      mockSpawnSync.mockReturnValue(cliAvailableProbe);
      mockSpawn.mockImplementation(() =>
        makeFakeCliChild({ exitCode: 1, stderr: "boom from cli" }),
      );
      const { service } = makeService({});

      await expect(
        service.generateText(baseRequest, LLMProvider.CLAUDE_CLI),
      ).rejects.toThrow(/exited with code 1.*boom from cli/);
    });

    it("rejects when the child is killed by the spawn timeout", async () => {
      mockSpawnSync.mockReturnValue(cliAvailableProbe);
      mockSpawn.mockImplementation(() =>
        makeFakeCliChild({ exitCode: null, signal: "SIGKILL" }),
      );
      const { service } = makeService({});

      await expect(
        service.generateText(baseRequest, LLMProvider.CLAUDE_CLI),
      ).rejects.toThrow(/killed with SIGKILL/);

      // The kill itself is enforced by Node via spawn's timeout option.
      expect(mockSpawn).toHaveBeenCalledWith(
        "claude",
        expect.any(Array),
        expect.objectContaining({
          timeout: 180_000,
          killSignal: "SIGKILL",
        }),
      );
    });

    it("throws without spawning a generation when the binary is unavailable", async () => {
      // beforeEach default: probe fails (ENOENT).
      const { service } = makeService({});

      await expect(
        service.generateText(baseRequest, LLMProvider.CLAUDE_CLI),
      ).rejects.toThrow(/Claude CLI not available/);
      expect(mockSpawn).not.toHaveBeenCalled();
    });

    it("honours CLAUDE_CLI_PATH and CLAUDE_CLI_MODEL overrides", async () => {
      mockSpawnSync.mockReturnValue(cliAvailableProbe);
      const envelope = JSON.stringify({ is_error: false, result: "ok" });
      mockSpawn.mockReturnValue(makeFakeCliChild({ stdout: envelope }));
      const { service } = makeService({
        CLAUDE_CLI_PATH: "/opt/bin/claude",
        CLAUDE_CLI_MODEL: "haiku",
      });

      await service.generateText(baseRequest, LLMProvider.CLAUDE_CLI);

      expect(mockSpawnSync).toHaveBeenCalledWith(
        "/opt/bin/claude",
        ["--version"],
        expect.any(Object),
      );
      const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]];
      expect(cmd).toBe("/opt/bin/claude");
      expect(args).toEqual(expect.arrayContaining(["--model", "haiku"]));
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

    it("includes claude-cli when the CLI binary probe succeeds", () => {
      mockSpawnSync.mockReturnValue(cliAvailableProbe);
      const { service } = makeService({ GEMINI_API_KEY: "g" });
      expect(service.getAvailableProviders()).toEqual([
        LLMProvider.GEMINI,
        LLMProvider.CLAUDE_CLI,
      ]);
    });
  });
});
