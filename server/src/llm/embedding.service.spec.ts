import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { cosineSimilarity, EmbeddingService } from "./embedding.service";
import { TokenUsageService } from "./token-usage.service";

const mockCreate = jest.fn();

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    embeddings: { create: mockCreate },
  })),
}));

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
      ],
    }).compile();

    return module.get<EmbeddingService>(EmbeddingService);
  }

  beforeEach(() => {
    mockTokenUsageService = { logUsage: jest.fn() };
    mockCreate.mockReset();
  });

  it("reports availability based on the OpenAI key", async () => {
    expect((await buildService("sk-test")).isAvailable()).toBe(true);
    expect((await buildService(undefined)).isAvailable()).toBe(false);
  });

  it("throws when embedding without an API key", async () => {
    const service = await buildService(undefined);
    await expect(service.embed(["hello"])).rejects.toThrow(
      "Embeddings unavailable",
    );
  });

  it("returns an empty array for empty input without calling the API", async () => {
    const service = await buildService("sk-test");
    const result = await service.embed([]);
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

    const result = await service.embed(["a", "b"]);

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

    const first = await service.embed(["cached"], { cache: true });
    const second = await service.embed(["cached"], { cache: true });

    expect(first).toEqual([[1, 0]]);
    expect(second).toEqual([[1, 0]]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("does not cache when cache option is omitted", async () => {
    const service = await buildService("sk-test");
    mockCreate.mockResolvedValue(buildEmbeddingResponse([[1, 0]]));

    await service.embed(["repeat"]);
    await service.embed(["repeat"]);

    expect(mockCreate).toHaveBeenCalledTimes(2);
  });
});
