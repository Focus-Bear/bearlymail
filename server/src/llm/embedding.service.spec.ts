import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";
import OpenAI from "openai";

import {
  cosineSimilarity,
  EmbeddingService,
  EmbeddingsUnavailableError,
} from "./embedding.service";
import { TokenUsageService } from "./token-usage.service";
import { UserAiKeysService } from "./user-ai-keys.service";
import type { UserAiKeys } from "./user-ai-routing";

const mockCreate = jest.fn();

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    embeddings: { create: mockCreate },
  })),
}));

const USER_ID = "user-1";
const SYSTEM_KEY = "sk-system-key";

/** The apiKey each OpenAI client was built with, in construction order. */
function openAiKeysUsed(): string[] {
  return jest
    .mocked(OpenAI)
    .mock.calls.map((call) => (call[0] as { apiKey: string }).apiKey);
}

function buildEmbeddingResponse(vectors: number[][]) {
  return {
    data: vectors.map((embedding) => ({ embedding })),
    usage: { prompt_tokens: 5, total_tokens: 5 },
  };
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 when a vector has zero magnitude", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });

  it("is scale-invariant", () => {
    expect(cosineSimilarity([1, 1], [2, 2])).toBeCloseTo(1);
  });
});

describe("EmbeddingService", () => {
  let mockTokenUsageService: jest.Mocked<Partial<TokenUsageService>>;
  let userKeys: UserAiKeys;

  async function buildService(apiKey?: string): Promise<EmbeddingService> {
    const mockConfigService: Partial<ConfigService> = {
      get: jest.fn((key: string) =>
        key === "OPENAI_API_KEY" ? apiKey : undefined,
      ) as unknown as ConfigService["get"],
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TokenUsageService, useValue: mockTokenUsageService },
        {
          provide: UserAiKeysService,
          useValue: { findKeys: jest.fn(async () => userKeys) },
        },
      ],
    }).compile();

    return module.get<EmbeddingService>(EmbeddingService);
  }

  beforeEach(() => {
    mockTokenUsageService = { logUsage: jest.fn() };
    mockCreate.mockReset();
    jest.mocked(OpenAI).mockClear();
    userKeys = {};
  });

  it("throws EmbeddingsUnavailableError without an API key", async () => {
    const service = await buildService(undefined);
    await expect(service.embed(["hello"], USER_ID)).rejects.toBeInstanceOf(
      EmbeddingsUnavailableError,
    );
  });

  describe("own AI account routing", () => {
    it("embeds with the user's own OpenAI key when they saved one", async () => {
      userKeys = { openai: "sk-user-openai" };
      const service = await buildService(SYSTEM_KEY);
      mockCreate.mockResolvedValue(buildEmbeddingResponse([[1, 0]]));

      await service.embed(["email"], USER_ID);

      expect(openAiKeysUsed()).toEqual([SYSTEM_KEY, "sk-user-openai"]);
      expect(mockTokenUsageService.logUsage).toHaveBeenCalledWith(
        expect.objectContaining({ userId: USER_ID }),
      );
    });

    it("skips embeddings instead of using BearlyMail's key when the user's own account has no OpenAI key", async () => {
      userKeys = { anthropic: "sk-ant-user" };
      const service = await buildService(SYSTEM_KEY);

      await expect(service.embed(["email"], USER_ID)).rejects.toBeInstanceOf(
        EmbeddingsUnavailableError,
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("uses BearlyMail's key for a user without their own keys", async () => {
      const service = await buildService(SYSTEM_KEY);
      mockCreate.mockResolvedValue(buildEmbeddingResponse([[1, 0]]));

      await service.embed(["email"], USER_ID);

      expect(openAiKeysUsed()).toEqual([SYSTEM_KEY]);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  it("returns an empty array for empty input without calling the API", async () => {
    const service = await buildService("sk-test");
    const result = await service.embed([], USER_ID);
    expect(result).toEqual([]);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("returns embeddings in input order and logs usage", async () => {
    const service = await buildService("sk-test");
    mockCreate.mockResolvedValue(
      buildEmbeddingResponse([
        [1, 0],
        [0, 1],
      ]),
    );

    const result = await service.embed(["a", "b"], USER_ID);

    expect(result).toEqual([
      [1, 0],
      [0, 1],
    ]);
    expect(mockTokenUsageService.logUsage).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 5, completionTokens: 0 }),
    );
  });

  it("serves cached texts and only sends misses to the API", async () => {
    const service = await buildService("sk-test");
    mockCreate.mockResolvedValue(buildEmbeddingResponse([[1, 0]]));

    const first = await service.embed(["cached"], USER_ID, { cache: true });
    const second = await service.embed(["cached"], USER_ID, { cache: true });

    expect(first).toEqual([[1, 0]]);
    expect(second).toEqual([[1, 0]]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("does not cache when cache option is omitted", async () => {
    const service = await buildService("sk-test");
    mockCreate.mockResolvedValue(buildEmbeddingResponse([[1, 0]]));

    await service.embed(["repeat"], USER_ID);
    await service.embed(["repeat"], USER_ID);

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
